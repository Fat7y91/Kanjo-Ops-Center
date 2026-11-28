import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { AccountPeriodStats } from "./clearing-report";
import type { StatementRange } from "./types";

type Row = {
  account_id: string;
  debit_minor: number | string;
  credit_minor: number | string;
  journal_entries:
    | {
        entry_date: string;
        source_type: string;
        source_id: string | null;
      }
    | {
        entry_date: string;
        source_type: string;
        source_id: string | null;
      }[]
    | null;
};

const BATCH = 200;

function entryOf(row: Row) {
  return Array.isArray(row.journal_entries)
    ? (row.journal_entries[0] ?? null)
    : row.journal_entries;
}

export async function listAccountPeriodStats(
  accountIds: string[],
  range: StatementRange,
): Promise<Map<string, AccountPeriodStats>> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  const stats = new Map<string, AccountPeriodStats>();
  if (ids.length === 0) return stats;

  const client = getSupabaseServerClient();
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += BATCH) {
    batches.push(ids.slice(index, index + BATCH));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      client
        .schema("app")
        .from("journal_lines")
        .select(
          "account_id,debit_minor,credit_minor,journal_entries!inner(entry_date,source_type,source_id)",
        )
        .in("account_id", batch)
        .limit(50_000),
    ),
  );

  const orders = new Map<string, Set<string>>();

  for (const { data, error } of results) {
    if (error) {
      if (isMissingSchemaObject(error)) continue;
      throw error;
    }

    for (const raw of (data ?? []) as unknown as Row[]) {
      const entry = entryOf(raw);
      if (!entry) continue;
      const day = entry.entry_date.slice(0, 10);
      if (range.from && day < range.from) continue;
      if (range.to && day > range.to) continue;

      const current =
        stats.get(raw.account_id) ?? {
          orderCount: 0,
          debitMinor: 0,
          creditMinor: 0,
        };
      current.debitMinor += Number(raw.debit_minor);
      current.creditMinor += Number(raw.credit_minor);
      stats.set(raw.account_id, current);

      if (entry.source_type === "operation") {
        const key = entry.source_id?.trim();
        if (!key) continue;
        const set = orders.get(raw.account_id) ?? new Set<string>();
        set.add(key);
        orders.set(raw.account_id, set);
      }
    }
  }

  for (const [accountId, set] of orders) {
    const current = stats.get(accountId);
    if (current) current.orderCount = set.size;
  }

  return stats;
}
