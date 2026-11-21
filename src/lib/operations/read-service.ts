import "server-only";

import { buildOrderBreakdown, type OrderBreakdown } from "./breakdown";
import {
  findOperationEntryId,
  listEntryLines,
} from "./breakdown-repository";
import { OperationsError } from "./errors";
import { resolvePartyNames } from "./party-lookup";
import { findOperation } from "./repository";
import {
  requireOperationsDatabase,
  translateOperationError,
} from "./service-guards";
import {
  findPartyAccount,
  listPartyStatementRows,
} from "./statement-repository";
import type { PartyStatement, PartyStatementLine } from "./types";

/**
 * Read-only management views over the operation book.
 *
 * The order breakdown and the party statement both render frozen data plus the
 * journal that produced it; neither writes. They live apart from the write-path
 * service so each file stays focused and within its size budget.
 */

/**
 * Unit-economics breakdown for one logged order.
 *
 * Reads the frozen money terms from the operation row and the posted lines from
 * its journal entry. The two are shown together so a reviewer can reconcile the
 * invoice against the book without a second screen. Missing rows answer 404; a
 * missing journal entry is reported as an unposted order, never as a fake
 * zeroed entry.
 */
export async function loadOrderBreakdown(
  operationId: string,
): Promise<OrderBreakdown> {
  requireOperationsDatabase();

  try {
    const operation = await findOperation(operationId);
    if (!operation) {
      throw new OperationsError(
        "OPERATION_NOT_FOUND",
        "العملية غير موجودة.",
        404,
      );
    }

    const entryId = await findOperationEntryId(operationId);
    const lines = entryId ? await listEntryLines(entryId) : [];

    return buildOrderBreakdown(operation, entryId, lines);
  } catch (error) {
    translateOperationError(error);
  }
}

/**
 * A party's statement of account: every journal line that moved their balance,
 * oldest first, with a running total.
 *
 * The closing balance is taken from the balance view, so the statement's own
 * arithmetic is cross-checked against the book the clearinghouse reads. A
 * mismatched closing figure proves a data defect instead of silently printing
 * a plausible number.
 */
export async function loadPartyStatement(
  accountId: string,
): Promise<PartyStatement> {
  requireOperationsDatabase();

  try {
    const account = await findPartyAccount(accountId);
    if (!account) {
      throw new OperationsError(
        "ACCOUNT_NOT_FOUND",
        "حساب الطرف غير موجود.",
        404,
      );
    }

    const rows = await listPartyStatementRows(accountId);
    const names = await resolvePartyNames({
      merchantIds: account.partyType === "merchant" ? [account.partyId] : [],
      courierIds: account.partyType === "courier" ? [account.partyId] : [],
    });
    const partyName =
      (account.partyType === "merchant"
        ? names.merchants.get(account.partyId)
        : names.couriers.get(account.partyId)) ??
      (account.partyType === "merchant" ? "تاجر غير معروف" : "مندوب غير معروف");

    let runningMinor = 0;
    const lines: PartyStatementLine[] = rows.map((row) => {
      runningMinor += row.debitMinor - row.creditMinor;
      return {
        id: row.id,
        entryId: row.entryId,
        date: row.date,
        reference: row.reference,
        memo: row.memo,
        debit: Math.round(row.debitMinor) / 100,
        credit: Math.round(row.creditMinor) / 100,
        running: Math.round(runningMinor) / 100,
      };
    });

    return {
      accountId: account.accountId,
      partyType: account.partyType,
      partyId: account.partyId,
      partyName,
      currency: account.currency,
      balance: account.balance,
      lines,
    };
  } catch (error) {
    translateOperationError(error);
  }
}
