import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { resolvePartyNames } from "./party-lookup";

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
  };
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
  const names = await resolvePartyNames({
    merchantIds: rows
      .filter((row) => row.party_type === "merchant")
      .map((row) => row.party_id ?? ""),
    courierIds: rows
      .filter((row) => row.party_type === "courier")
      .map((row) => row.party_id ?? ""),
  });

  return rows
    .map((row) => toAccount(row, names))
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
  },
): Promise<string> {
  const client = getSupabaseServerClient();
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
