import "server-only";

import {
  isMissingSchemaObject,
  isQueryTimeout,
} from "@/lib/db/supabase/errors";

import { OperationsError, fromDatabaseError } from "./errors";
import {
  listClearingAccounts,
  postSettlement,
} from "./clearinghouse-repository";
import { resolvePartyNames } from "./party-lookup";
import {
  insertOperation,
  isOperationsDatabaseConfigured,
  listOperations,
} from "./repository";
import { planImport, type ImportRoster } from "./orders-import";
import {
  listCouponOptions,
  listCouriers,
  listMerchantOptions,
} from "./options-repository";
import {
  operationLogInputSchema,
  settleInputSchema,
  toMinorUnits,
  toOperationSummary,
  type ClearingAccountRow,
  type CourierOption,
  type CouponOption,
  type MerchantOption,
  type OperationSummary,
} from "./types";

/**
 * Tier 3 rules for the operations logger and the clearinghouse.
 *
 * Logging an order is a single write: the SQL triggers freeze the money terms
 * and post one balanced journal entry in the same transaction, so this layer
 * never touches the ledger on the create path. Settling posts a fresh balanced
 * entry that zeroes a party's derived balance; journal history is never
 * mutated.
 */

export type OperationsBoard = {
  operations: OperationSummary[];
  couriers: CourierOption[];
  merchants: MerchantOption[];
  coupons: CouponOption[];
};

export type ClearinghouseBoard = {
  accounts: ClearingAccountRow[];
  payables: ClearingAccountRow[];
  receivables: ClearingAccountRow[];
  /** Recent orders with their frozen money terms, for the breakdown drill-down. */
  operations: OperationSummary[];
};

function requireDatabase(): void {
  if (!isOperationsDatabaseConfigured()) {
    throw new OperationsError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }
}

function translate(error: unknown): never {
  if (error instanceof OperationsError) throw error;
  if (isQueryTimeout(error)) {
    // A slow database is a retryable deployment condition, not a bad request:
    // answer 503 so the client keeps the order in the form instead of reading
    // the failure as a validation error it should fix.
    throw new OperationsError(
      "STORE_TIMEOUT",
      "استغرق الخادم وقتاً أطول من المتوقع. لم يُؤكَّد تسجيل العملية؛ أعد المحاولة.",
      503,
    );
  }
  const domain = fromDatabaseError(error);
  if (domain) throw domain;
  throw error;
}

/** The logging form needs the roster and the merchant list beside it. */
export async function loadOperationsBoard(): Promise<OperationsBoard> {
  requireDatabase();

  const [operations, couriers, merchants, coupons] = await Promise.all([
    listOperations(),
    listCouriers(),
    listMerchantOptions(),
    listCouponOptions(),
  ]);

  return {
    operations: operations.map(toOperationSummary),
    couriers,
    merchants,
    coupons,
  };
}

/**
 * Logs a fulfilled order.
 *
 * The employee only submits what they can see: the order, the parties, the
 * payment method, an optional coupon and an optional manual wallet discount.
 * Commission, courier profit and the coupon split are resolved and frozen by
 * the SQL trigger, so no financial figure is accepted from the form and the
 * logger never needs to see one.
 */
export async function logOperation(
  loggedBy: string,
  rawInput: unknown,
): Promise<OperationSummary> {
  requireDatabase();
  const input = operationLogInputSchema.parse(rawInput);

  try {
    const operation = await insertOperation({
      orderId: input.orderId,
      merchantId: input.merchantId,
      courierId: input.courierId,
      paymentMethod: input.paymentMethod,
      currency: input.currency,
      orderValueMinor: toMinorUnits(input.orderValue),
      deliveryFeeMinor: toMinorUnits(input.deliveryFee),
      couponId: input.couponId,
      walletDiscountMinor: toMinorUnits(input.walletDiscount),
      walletDiscountReason: input.walletDiscountReason,
      walletDiscountRef: input.walletDiscountRef,
      note: input.note,
      loggedBy,
    });
    // The insert answers with the stored money terms but no joined roster, so
    // the row the operator sees would revert to a generic party label. Resolve
    // the names once here, after the write is committed, so the returned row
    // matches the list. A lookup failure still answers with a neutral label.
    const names = await resolvePartyNames({
      merchantIds: [operation.merchantId],
      courierIds: [operation.courierId],
    });
    return toOperationSummary({
      ...operation,
      merchantName: names.merchants.get(operation.merchantId) ?? "تاجر",
      courierName: names.couriers.get(operation.courierId) ?? "مندوب",
    });
  } catch (error) {
    translate(error);
  }
}

/**
 * Bulk-imports fulfilled orders from a parsed CSV file.
 *
 * Every row is validated against the live roster before anything is written, so
 * a file with an unknown vendor is rejected as a whole rather than partially
 * posted. Each accepted order goes through the same insert path as a manual
 * entry, which means the freeze and routing triggers run per row and the
 * merchant and courier balances move exactly as they would for a manual order.
 * The result reports the imported count and the rows that were skipped, so the
 * operator can fix the spreadsheet and retry just those.
 */
export async function importOrders(
  loggedBy: string,
  rows: readonly Record<string, unknown>[],
  roster: ImportRoster,
): Promise<{
  imported: number;
  skipped: { line: number; message: string }[];
}> {
  requireDatabase();

  const plan = planImport(rows, roster);
  const skipped = [...plan.duplicates, ...plan.issues];
  if (plan.candidates.length === 0) {
    return { imported: 0, skipped };
  }

  let imported = 0;
  for (const candidate of plan.candidates) {
    try {
      await insertOperation({
        orderId: candidate.orderId,
        merchantId: candidate.merchantId,
        courierId: candidate.courierId,
        paymentMethod: candidate.paymentMethod,
        currency: candidate.currency,
        orderValueMinor: toMinorUnits(candidate.orderValue),
        deliveryFeeMinor: toMinorUnits(candidate.deliveryFee),
        couponId: null,
        walletDiscountMinor: 0,
        walletDiscountReason: "",
        walletDiscountRef: "",
        note: candidate.note,
        loggedBy,
        occurredAt: candidate.occurredAt,
      });
      imported += 1;
    } catch (error) {
      const domain = error instanceof OperationsError ? error : fromDatabaseError(error);
      skipped.push({
        line: candidate.line,
        message: domain?.message ?? "تعذر تسجيل الطلب.",
      });
    }
  }

  return { imported, skipped };
}

/**
 * The clearinghouse book.
 *
 * Payables are party accounts with a negative balance (Kanjo owes them);
 * receivables are positive (they owe Kanjo). Both are slices of the same
 * derived list, so the two panels can never disagree.
 */
export async function loadClearinghouse(): Promise<ClearinghouseBoard> {
  requireDatabase();

  try {
    const [accounts, operations] = await Promise.all([
      listClearingAccounts(),
      listOperations(40),
    ]);
    return {
      accounts,
      payables: accounts.filter((account) => account.balance < 0),
      receivables: accounts.filter((account) => account.balance > 0),
      operations: operations.map(toOperationSummary),
    };
  } catch (error) {
    if (isMissingSchemaObject(error)) {
      return { accounts: [], payables: [], receivables: [], operations: [] };
    }
    throw error;
  }
}

/**
 * Settles a party account by posting a balanced entry that zeroes its balance.
 *
 * The receipt (`receipt_no` + storage path) is attached to the same entry, so
 * it is visible wherever the settlement is shown. Returns the new entry id.
 */
export async function settleClearingAccount(
  accountId: string,
  settledBy: string,
  rawInput: unknown,
): Promise<string> {
  requireDatabase();
  const input = settleInputSchema.parse(rawInput);

  try {
    return await postSettlement(accountId, settledBy, {
      receiptNo: input.receiptNo,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? null,
      amountMinor:
        input.amount != null ? toMinorUnits(input.amount) : null,
    });
  } catch (error) {
    translate(error);
  }
}
