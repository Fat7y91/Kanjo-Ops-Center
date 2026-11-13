import "server-only";

import { insertImportedCourier } from "@/lib/couriers/repository";
import { matchKey } from "@/lib/import/csv";

import { OperationsError, fromDatabaseError } from "./errors";
import { planImport, type ImportRoster } from "./orders-import";
import { insertOperation, isOperationsDatabaseConfigured } from "./repository";
import { toMinorUnits } from "./types";

/**
 * Tier 3 rules for the bulk orders CSV import.
 *
 * Kept apart from the logger so each file owns one job: this module maps a
 * parsed file onto the live roster, optionally creates the couriers the file
 * names, and posts each accepted row through the same insert path as a manual
 * order. The posting triggers freeze the money terms per row.
 */

function requireDatabase(): void {
  if (!isOperationsDatabaseConfigured()) {
    throw new OperationsError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }
}

/**
 * Creates the couriers an import references but the roster does not hold.
 *
 * Only reached after the operator explicitly confirmed the missing names in the
 * preview. Phone is left empty because the spreadsheet does not carry one; the
 * fixed profit is the amount the operator entered beside the checkbox and is
 * copied onto every new courier so the imported orders post the right ledgers.
 * A name that fails to insert stays unknown, and the final plan reports its row
 * as skipped.
 */
async function createMissingCouriers(
  rows: readonly Record<string, unknown>[],
  roster: ImportRoster,
  profits: Record<string, number>,
): Promise<ImportRoster> {
  const preview = planImport(rows, roster, { createMissingCouriers: true });
  if (preview.missingCouriers.length === 0) return roster;

  const couriers = new Map(roster.couriers);
  for (const name of preview.missingCouriers) {
    try {
      const createdId = await insertImportedCourier(name, profits[name] ?? 0);
      couriers.set(matchKey(name), createdId);
    } catch {
      // Left unresolved: the final plan turns this row into a skipped issue.
    }
  }

  return { merchants: roster.merchants, couriers };
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
  options: {
    createMissingCouriers?: boolean;
    courierProfits?: Record<string, number>;
  } = {},
): Promise<{
  imported: number;
  skipped: { line: number; message: string }[];
}> {
  requireDatabase();

  const activeRoster = options.createMissingCouriers
    ? await createMissingCouriers(rows, roster, options.courierProfits ?? {})
    : roster;

  const plan = planImport(rows, activeRoster);
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
