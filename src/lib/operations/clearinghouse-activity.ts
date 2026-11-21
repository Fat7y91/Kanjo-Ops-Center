import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Per-account ledger recency, used by the settlement screen's sort and period
 * filter. Everything is derived from the journal: the account's latest line and
 * its latest settlement line (`merchant_settlement` / `courier_payout`).
 */

export type AccountActivity = {
  accountId: string;
  lastActivityAt: string | null;
  lastSettlementAt: string | null;
};

const SETTLEMENT_SOURCES = new Set(["merchant_settlement", "courier_payout"]);

type LineRow = {
  account_id: string;
  journal_entries:
    | { entry_date: string; source_type: string }
    | { entry_date: string; source_type: string }[]
    | null;
};

function entryOf(row: LineRow) {
  return Array.isArray(row.journal_entries)
    ? (row.journal_entries[0] ?? null)
    : row.journal_entries;
}

export async function listPartyActivity(
  accountIds: string[],
): Promise<Map<string, AccountActivity>> {
  const activity = new Map<string, AccountActivity>();
  const ids = [...new Set(accountIds.filter((id) => id !== ""))];
  if (ids.length === 0) return activity;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_lines")
    .select("account_id,journal_entries!inner(entry_date,source_type)")
    .in("account_id", ids)
    .limit(50000);

  if (error) {
    if (isMissingSchemaObject(error)) return activity;
    throw error;
  }

  for (const raw of (data ?? []) as unknown as LineRow[]) {
    const entry = entryOf(raw);
    if (!entry) continue;
    const current =
      activity.get(raw.account_id) ??
      ({
        accountId: raw.account_id,
        lastActivityAt: null,
        lastSettlementAt: null,
      } satisfies AccountActivity);

    if (!current.lastActivityAt || entry.entry_date > current.lastActivityAt) {
      current.lastActivityAt = entry.entry_date;
    }
    if (
      SETTLEMENT_SOURCES.has(entry.source_type) &&
      (!current.lastSettlementAt || entry.entry_date > current.lastSettlementAt)
    ) {
      current.lastSettlementAt = entry.entry_date;
    }
    activity.set(raw.account_id, current);
  }

  return activity;
}

type AttendanceRow = { source_id: string | null; entry_date: string };

/**
 * The days each courier attended, from the `courier_attendance` journal source.
 * `source_id` is `attendance:<courierId>:<day>`; the day is parsed from it and
 * falls back to the entry date, so a malformed id never loses the day.
 */
export async function listCourierWorkingDates(): Promise<Map<string, string[]>> {
  const working = new Map<string, string[]>();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_entries")
    .select("source_id,entry_date")
    .eq("source_type", "courier_attendance")
    .limit(20000);

  if (error) {
    if (isMissingSchemaObject(error)) return working;
    throw error;
  }

  for (const raw of (data ?? []) as AttendanceRow[]) {
    const sourceId = raw.source_id ?? "";
    const parts = sourceId.split(":");
    const courierId = parts.length >= 2 ? parts[1] : "";
    if (!courierId) continue;
    const day = parts.length >= 3 && parts[2] ? parts[2] : raw.entry_date;
    const dates = working.get(courierId) ?? [];
    dates.push(day);
    working.set(courierId, dates);
  }

  for (const [courierId, dates] of working) {
    working.set(courierId, [...new Set(dates)].sort());
  }

  return working;
}
