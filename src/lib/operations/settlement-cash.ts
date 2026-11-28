import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Cash actually collected from posted merchant settlements, split by currency.
 *
 * A receivable settlement debits the bank and credits the party; a payable
 * settlement does the reverse. Summing only the bank's debit legs therefore
 * counts money that actually landed and never a payout. This is a book figure,
 * not accrued commission: it stays 0 until a settlement entry is posted.
 */

type CashInRow = {
  debit_minor: number | string;
  journal_entries:
    | { currency: "EGP" | "SAR"; source_type: string }
    | { currency: "EGP" | "SAR"; source_type: string }[]
    | null;
};

const EMPTY: Record<"EGP" | "SAR", number> = { EGP: 0, SAR: 0 };

export async function loadCollectedCashIn(): Promise<
  Record<"EGP" | "SAR", number>
> {
  const collected: Record<"EGP" | "SAR", number> = { ...EMPTY };
  const client = getSupabaseServerClient();

  const bank = await client
    .schema("app")
    .from("accounts")
    .select("id")
    .eq("code", "1000")
    .limit(1)
    .maybeSingle();

  if (bank.error || !bank.data) {
    if (bank.error && !isMissingSchemaObject(bank.error)) throw bank.error;
    return collected;
  }

  const { data, error } = await client
    .schema("app")
    .from("journal_lines")
    .select("debit_minor,journal_entries!inner(currency,source_type)")
    .eq("account_id", (bank.data as { id: string }).id)
    .eq("journal_entries.source_type", "merchant_settlement")
    .limit(20000);

  if (error) {
    if (isMissingSchemaObject(error)) return collected;
    throw error;
  }

  for (const raw of (data ?? []) as unknown as CashInRow[]) {
    const entry = Array.isArray(raw.journal_entries)
      ? raw.journal_entries[0]
      : raw.journal_entries;
    if (!entry) continue;
    const minor = Number(raw.debit_minor);
    if (!Number.isFinite(minor) || minor === 0) continue;
    collected[entry.currency] += minor / 100;
  }

  return collected;
}
