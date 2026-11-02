import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";

import { OperationsError, fromDatabaseError } from "./errors";
import {
  listClearingLedgers,
  settleLedger,
  summarizeParties,
} from "./clearinghouse-repository";
import {
  insertOperation,
  isOperationsDatabaseConfigured,
  listCouriers,
  listMerchantOptions,
  listOperations,
} from "./repository";
import {
  operationLogInputSchema,
  settleInputSchema,
  toMinorUnits,
  type ClearingLedgerRow,
  type ClearingParty,
  type ClearingStatus,
  type CourierOption,
  type MerchantOption,
  type OperationLog,
} from "./types";

/**
 * Tier 3 rules for the operations logger and the clearinghouse.
 *
 * Logging an order is a single write: the SQL triggers freeze the money terms
 * and route both ledger rows in the same transaction, so this layer never
 * touches `app.financial_ledgers` on the create path. Settling is the only
 * place a ledger row is written, and it can only move forward.
 */

export type OperationsBoard = {
  operations: OperationLog[];
  couriers: CourierOption[];
  merchants: MerchantOption[];
};

export type ClearinghouseBoard = {
  rows: ClearingLedgerRow[];
  payables: ClearingParty[];
  receivables: ClearingParty[];
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
  const domain = fromDatabaseError(error);
  if (domain) throw domain;
  throw error;
}

/** The logging form needs the roster and the merchant list beside it. */
export async function loadOperationsBoard(): Promise<OperationsBoard> {
  requireDatabase();

  const [operations, couriers, merchants] = await Promise.all([
    listOperations(),
    listCouriers(),
    listMerchantOptions(),
  ]);

  return { operations, couriers, merchants };
}

/**
 * Logs a fulfilled order.
 *
 * Commission always comes from the merchant contract, not from the form: the
 * service parses the payload but deliberately does not forward a percent. The
 * SQL trigger resolves it, freezes it, and routes the two ledger rows.
 */
export async function logOperation(
  loggedBy: string,
  rawInput: unknown,
): Promise<OperationLog> {
  requireDatabase();
  const input = operationLogInputSchema.parse(rawInput);

  try {
    return await insertOperation({
      orderId: input.orderId,
      merchantId: input.merchantId,
      courierId: input.courierId,
      paymentMethod: input.paymentMethod,
      currency: input.currency,
      orderValueMinor: toMinorUnits(input.orderValue),
      deliveryFeeMinor: toMinorUnits(input.deliveryFee),
      courierCutMinor: toMinorUnits(input.courierCut),
      note: input.note,
      loggedBy,
    });
  } catch (error) {
    translate(error);
  }
}

/**
 * The clearinghouse book.
 *
 * Payables are parties with a positive balance (Kanjo owes them); receivables
 * are negative (they owe Kanjo). Both are derived from the same pending rows,
 * so the two panels can never disagree.
 */
export async function loadClearinghouse(
  status: ClearingStatus = "pending",
): Promise<ClearinghouseBoard> {
  requireDatabase();

  try {
    const rows = await listClearingLedgers(status);
    const parties = summarizeParties(rows);
    return {
      rows,
      payables: parties.filter((party) => party.balance > 0),
      receivables: parties.filter((party) => party.balance < 0),
    };
  } catch (error) {
    if (isMissingSchemaObject(error)) {
      return { rows: [], payables: [], receivables: [] };
    }
    throw error;
  }
}

/** Marks one row settled. The trigger stamps `cleared_at` if it is missing. */
export async function settleClearingRow(
  id: string,
  clearedBy: string,
  rawInput: unknown,
): Promise<ClearingLedgerRow> {
  requireDatabase();
  const input = settleInputSchema.parse(rawInput);

  try {
    return await settleLedger(id, clearedBy, input.receiptUrl);
  } catch (error) {
    translate(error);
  }
}
