import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

const READ_TIMEOUT_MS = 6_000;

type StatementLineRow = {
  id: string;
  entry_id: string;
  debit_minor: number | string;
  credit_minor: number | string;
  memo: string | null;
  journal_entries:
    | {
        entry_date: string;
        memo: string | null;
        source_type: string;
        source_id: string | null;
        created_at: string;
      }
    | {
        entry_date: string;
        memo: string | null;
        source_type: string;
        source_id: string | null;
        created_at: string;
      }[]
    | null;
};

type PartyAccountRow = {
  id: string;
  party_type: "merchant" | "courier" | null;
  party_id: string | null;
  currency: "EGP" | "SAR";
  balance_minor: number | string;
};

/**
 * Tier 4 reads for a party's statement of account.
 *
 * Kept apart from the operations repository so the statement's join-heavy read
 * lives next to the shape it renders, and so the operations file stays within
 * its size budget.
 */

/**
 * The journal lines of one party account, oldest first.
 *
 * A statement needs the date and a human reference on every line, so each line
 * joins its entry for `entry_date`, `memo`, `source_type` and `source_id`. The
 * reference prefers the entry memo (which already names the order or the
 * settlement) and falls back to the raw source id, so a line is never blank.
 */
export async function listPartyStatementRows(accountId: string): Promise<
  {
    id: string;
    entryId: string;
    date: string;
    reference: string;
    memo: string;
    debitMinor: number;
    creditMinor: number;
  }[]
> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_lines")
    .select(
      "id,entry_id,debit_minor,credit_minor,memo,journal_entries(entry_date,memo,source_type,source_id,created_at)",
    )
    .eq("account_id", accountId)
    .limit(2000)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }

  const entryOf = (row: StatementLineRow) =>
    Array.isArray(row.journal_entries)
      ? (row.journal_entries[0] ?? null)
      : row.journal_entries;

  return ((data ?? []) as unknown as StatementLineRow[])
    .map((row) => {
      const entry = entryOf(row);
      const date = entry?.entry_date ?? entry?.created_at ?? "";
      const reference =
        entry?.memo?.trim() ||
        row.memo?.trim() ||
        entry?.source_id ||
        entry?.source_type ||
        "قيد";
      return {
        id: row.id,
        entryId: row.entry_id,
        date,
        reference,
        memo: row.memo ?? "",
        debitMinor: Number(row.debit_minor),
        creditMinor: Number(row.credit_minor),
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * One party account row from the balance view, for a statement header.
 *
 * Returns null when the id is not a party account (a control account or an
 * unknown id), so a statement request can answer 404 instead of pricing a
 * control account as if it belonged to a merchant.
 */
export async function findPartyAccount(
  accountId: string,
): Promise<{
  accountId: string;
  partyType: "merchant" | "courier";
  partyId: string;
  currency: "EGP" | "SAR";
  balance: number;
} | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_account_balances")
    .select("id,party_type,party_id,currency,balance_minor")
    .eq("id", accountId)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  if (!data) return null;

  const row = data as unknown as PartyAccountRow;
  if (!row.party_type || !row.party_id) return null;

  return {
    accountId: row.id,
    partyType: row.party_type,
    partyId: row.party_id,
    currency: row.currency,
    balance: Number(row.balance_minor) / 100,
  };
}
