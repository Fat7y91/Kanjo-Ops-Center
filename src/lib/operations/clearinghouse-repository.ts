import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

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

function toAccount(row: BalanceViewRow): ClearingAccountRow {
  return {
    accountId: row.id,
    partyType: row.party_type as ClearingPartyType,
    partyId: row.party_id ?? "",
    partyName: row.name,
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

  return ((data ?? []) as BalanceViewRow[])
    .map(toAccount)
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
