import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

const READ_TIMEOUT_MS = 6_000;

type JournalLineRow = {
  id: string;
  debit_minor: number | string;
  credit_minor: number | string;
  memo: string | null;
  accounts:
    | { code: string; name: string }
    | { code: string; name: string }[]
    | null;
};

/**
 * Tier 4 reads that back the order breakdown.
 *
 * The breakdown shows an operation's frozen terms beside the journal entry it
 * posted, so it needs exactly two reads: the entry id the posting trigger
 * stamped, and that entry's lines joined to their account code and name.
 */

/**
 * The operation's journal entry id.
 *
 * `operation_logs.journal_entry_id` is the link the posting trigger stamps, so
 * the breakdown reads the exact entry that was posted for this order rather
 * than guessing from the source id.
 */
export async function findOperationEntryId(
  operationId: string,
): Promise<string | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_logs")
    .select("journal_entry_id")
    .eq("id", operationId)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return (
    (data as { journal_entry_id: string | null } | null)?.journal_entry_id ??
    null
  );
}

/**
 * The posted lines of one journal entry, with account code and name.
 *
 * Ordering is by account code so the audit view reads as a statement; the
 * caller must not rely on insert order, which the table does not promise.
 */
export async function listEntryLines(entryId: string): Promise<
  {
    id: string;
    code: string;
    name: string;
    debitMinor: number;
    creditMinor: number;
    memo: string;
  }[]
> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_lines")
    .select("id,debit_minor,credit_minor,memo,accounts(code,name)")
    .eq("entry_id", entryId)
    .limit(200)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }

  return ((data ?? []) as unknown as JournalLineRow[])
    .map((row) => {
      const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
      return {
        id: row.id,
        code: account?.code ?? "",
        name: account?.name ?? "",
        debitMinor: Number(row.debit_minor),
        creditMinor: Number(row.credit_minor),
        memo: row.memo ?? "",
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));
}
