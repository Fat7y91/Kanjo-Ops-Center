import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { resolvePartyNames } from "./party-lookup";
import { loadCollectedCashIn } from "./settlement-cash";
import {
  listCourierWorkingDates,
  listPartyActivity,
} from "./clearinghouse-activity";

import type { ClearingAccountRow, ClearingPartyType } from "./types";

/**
 * Tier 4 repository for the clearinghouse, backed by the double-entry journal.
 *
 * There are no per-order "pending" rows to settle any more. The book is a set
 * of party ledger accounts (`accounts.party_type` not null) under the merchant
 * and courier control accounts, each with a derived balance:
 *
 *   balance_minor = sum(debits) − sum(credits)
 *
 * Positive → the party owes Kanjo (receivable). Negative → Kanjo owes the party
 * (payable). Settlement posts a fresh balanced entry (see
 * `app.post_settlement`); nothing is ever mutated in place.
 *
 * The account row carries a label frozen when the party sub-account was opened
 * (`"merchant KJ-…"`), so the current name is resolved from the roster at read
 * time. A renamed merchant shows its new name, and a raw id never reaches the
 * screen.
 */

type BalanceViewRow = {
  id: string;
  code: string;
  name: string;
  party_type: ClearingPartyType | null;
  party_id: string | null;
  currency: ClearingAccountRow["currency"];
  balance_minor: number;
};

const BALANCE_VIEW = "journal_account_balances";
const BALANCE_COLUMNS =
  "id,code,name,party_type,party_id,currency,balance_minor";

function toAccount(
  row: BalanceViewRow,
  names: { merchants: Map<string, string>; couriers: Map<string, string> },
  internalCouriers: Set<string>,
): ClearingAccountRow {
  const partyType = row.party_type as ClearingPartyType;
  const partyId = row.party_id ?? "";
  const resolved =
    partyType === "merchant"
      ? names.merchants.get(partyId)
      : names.couriers.get(partyId);

  return {
    accountId: row.id,
    partyType,
    partyId,
    partyName:
      resolved ??
      (partyType === "merchant" ? "تاجر غير معروف" : "مندوب غير معروف"),
    currency: row.currency,
    balance: Number(row.balance_minor) / 100,
    isInternalStaff:
      partyType === "courier" && internalCouriers.has(partyId),
  };
}

async function listInternalCourierIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter((id) => id !== ""))];
  if (unique.length === 0) return new Set();

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select("id")
    .in("id", unique)
    .eq("is_internal_staff", true)
    .limit(unique.length);

  if (error) {
    if (isMissingSchemaObject(error)) return new Set();
    throw error;
  }
  return new Set((data ?? []).map((row) => (row as { id: string }).id));
}

/**
 * Every party account with a non-zero balance, most material first.
 *
 * The filter runs in JS rather than the query so the view stays a plain
 * `select *`-shaped read; a party set is small (one row per active party).
 */
export async function listClearingAccounts(): Promise<ClearingAccountRow[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from(BALANCE_VIEW)
    .select(BALANCE_COLUMNS)
    .not("party_type", "is", null)
    .order("balance_minor", { ascending: false })
    .limit(2000);

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }

  const rows = (data ?? []) as BalanceViewRow[];
  const courierIds = rows
    .filter((row) => row.party_type === "courier")
    .map((row) => row.party_id ?? "");
  const [names, activity, workingDates, internalCouriers] = await Promise.all([
    resolvePartyNames({
      merchantIds: rows
        .filter((row) => row.party_type === "merchant")
        .map((row) => row.party_id ?? ""),
      courierIds,
    }),
    listPartyActivity(rows.map((row) => row.id)),
    listCourierWorkingDates(),
    listInternalCourierIds(courierIds),
  ]);

  return rows
    .map((row) => {
      const account = toAccount(row, names, internalCouriers);
      const recent = activity.get(account.accountId);
      return {
        ...account,
        lastActivityAt: recent?.lastActivityAt ?? null,
        lastSettlementAt: recent?.lastSettlementAt ?? null,
        ...(account.partyType === "courier"
          ? { workingDates: workingDates.get(account.partyId) ?? [] }
          : {}),
      };
    })
    .filter((row) => row.balance !== 0);
}

/**
 * Settles one party account by posting a balanced journal entry.
 *
 * The SQL function computes the outstanding balance itself, so a stale screen
 * can never settle the wrong amount. Returns the new journal entry id.
 */
export async function postSettlement(
  accountId: string,
  actorId: string,
  receipt: {
    receiptNo: string | null;
    storagePath: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    /**
     * When present, settles only this amount (minor units) through the
     * bounded partial-settlement function; when absent, zeroes the account.
     */
    amountMinor?: number | null;
  },
): Promise<string> {
  const client = getSupabaseServerClient();

  if (receipt.amountMinor != null) {
    const { data, error } = await client
      .schema("app")
      .rpc("post_partial_settlement", {
        p_account_id: accountId,
        p_amount_minor: receipt.amountMinor,
        p_actor: actorId,
        p_receipt_no: receipt.receiptNo,
        p_storage_path: receipt.storagePath,
        p_mime_type: receipt.mimeType,
        p_size_bytes: receipt.sizeBytes,
      });

    if (error) throw error;
    return data as string;
  }

  const { data, error } = await client
    .schema("app")
    .rpc("post_settlement", {
      p_account_id: accountId,
      p_actor: actorId,
      p_receipt_no: receipt.receiptNo,
      p_storage_path: receipt.storagePath,
      p_mime_type: receipt.mimeType,
      p_size_bytes: receipt.sizeBytes,
    });

  if (error) throw error;
  return data as string;
}

export type PartyBalanceTotals = {
  currency: ClearingAccountRow["currency"];
  receivables: number;
  payables: number;
  /**
   * Cash actually received from merchant settlements, posted to the bank. This
   * is a raked figure, not accrued commission: it stays 0 until a settlement
   * entry hits the journal.
   */
  collected: number;
};

const ZERO_TOTALS: PartyBalanceTotals[] = [
  { currency: "EGP", receivables: 0, payables: 0, collected: 0 },
  { currency: "SAR", receivables: 0, payables: 0, collected: 0 },
];

/**
 * Company-wide receivable/payable totals, split by currency.
 *
 * These are absolute book positions, not period flows: the dashboard must not
 * apply its date filter to them. Only party accounts are included; control and
 * bank accounts are excluded by the view's `party_type` column.
 */
export async function loadPartyBalanceTotals(): Promise<PartyBalanceTotals[]> {
  const client = getSupabaseServerClient();
  const [{ data, error }, collected] = await Promise.all([
    client
      .schema("app")
      .from(BALANCE_VIEW)
      .select("currency,balance_minor")
      .not("party_type", "is", null)
      .limit(2000),
    loadCollectedCashIn(),
  ]);

  if (error) {
    if (isMissingSchemaObject(error)) return ZERO_TOTALS;
    throw error;
  }

  const totals: Record<"EGP" | "SAR", PartyBalanceTotals> = {
    EGP: { currency: "EGP", receivables: 0, payables: 0, collected: collected.EGP },
    SAR: { currency: "SAR", receivables: 0, payables: 0, collected: collected.SAR },
  };

  for (const raw of (data ?? []) as Array<{
    currency: "EGP" | "SAR";
    balance_minor: number | string;
  }>) {
    const amount = Number(raw.balance_minor) / 100;
    if (!Number.isFinite(amount) || amount === 0) continue;
    const bucket = totals[raw.currency];
    if (!bucket) continue;
    if (amount > 0) bucket.receivables += amount;
    else bucket.payables += -amount;
  }

  return [totals.EGP, totals.SAR];
}
