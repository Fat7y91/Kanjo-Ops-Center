import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { BiOperatingCostFact } from "./types";

/**
 * Posted expense and operating-revenue legs for the Net Profit row.
 *
 * Reads only the accounts below the order line: courier pay (5100), courier and
 * merchant adjustments (5110/5210) and other operating expenses (5xxx), plus the
 * other-operating-revenue credit (4900) that nets those adjustments down. The
 * coupon account (5000) is included in the range but skipped by the summary,
 * because it is already netted off the frozen order profit.
 *
 * The read is bounded and never throws on a missing schema, so a legacy database
 * without the journal tables still renders the rest of the dashboard.
 */

const ROW_LIMIT = 20_000;
const TIMEOUT_MS = 8_000;

type RawLine = {
  debit_minor: number | string | null;
  credit_minor: number | string | null;
  accounts:
    | {
        code: string;
        party_type: BiOperatingCostFact["partyType"];
        party_id: string | null;
      }
    | {
        code: string;
        party_type: BiOperatingCostFact["partyType"];
        party_id: string | null;
      }[]
    | null;
  journal_entries:
    | { entry_date: string; source_type: string; source_id: string | null }
    | { entry_date: string; source_type: string; source_id: string | null }[]
    | null;
};

function embed<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function asMinor(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export async function loadOperatingCostFacts(): Promise<BiOperatingCostFact[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_lines")
    .select(
      "debit_minor,credit_minor,accounts!inner(code,party_type,party_id),journal_entries!inner(entry_date,source_type,source_id)",
    )
    .eq("journal_entries.status", "posted")
    .gte("accounts.code", "4900")
    .lte("accounts.code", "5999")
    .limit(ROW_LIMIT)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }

  const facts: BiOperatingCostFact[] = [];
  for (const line of (data ?? []) as unknown as RawLine[]) {
    const account = embed(line.accounts);
    const entry = embed(line.journal_entries);
    if (!account || !entry) continue;
    facts.push({
      day: entry.entry_date,
      code: account.code,
      sourceType: entry.source_type,
      sourceId: entry.source_id,
      partyType: account.party_type,
      partyId: account.party_id,
      debitMinor: asMinor(line.debit_minor),
      creditMinor: asMinor(line.credit_minor),
    });
  }
  return facts;
}
