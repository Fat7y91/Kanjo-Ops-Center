import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Tier 4 aggregates for the couriers roster.
 *
 * Earnings and delivery counts come from the append-only operations log. The
 * outstanding balance comes from the double-entry journal: a courier's ledger
 * account under `2100` is a liability, so a positive "owed to courier" figure
 * is the negation of its `debit − credit` balance. Nothing is stored.
 */

export type CourierTotals = {
  earnings: Map<string, number>;
  deliveries: Map<string, number>;
  balances: Map<string, number>;
};

type OperationRow = {
  courier_id: string;
  courier_cut_minor: number;
};

type BalanceRow = {
  party_id: string | null;
  balance_minor: number;
};

export async function loadCourierTotals(): Promise<CourierTotals> {
  const client = getSupabaseServerClient();
  const earnings = new Map<string, number>();
  const deliveries = new Map<string, number>();
  const balances = new Map<string, number>();

  const operations = await client
    .schema("app")
    .from("operation_logs")
    .select("courier_id,courier_cut_minor")
    .limit(5000);

  if (!operations.error) {
    for (const row of (operations.data ?? []) as OperationRow[]) {
      const current = earnings.get(row.courier_id) ?? 0;
      earnings.set(row.courier_id, current + Number(row.courier_cut_minor) / 100);
      deliveries.set(row.courier_id, (deliveries.get(row.courier_id) ?? 0) + 1);
    }
  } else if (!isMissingSchemaObject(operations.error)) {
    throw operations.error;
  }

  const journal = await client
    .schema("app")
    .from("journal_account_balances")
    .select("party_id,balance_minor")
    .eq("party_type", "courier")
    .limit(5000);

  if (!journal.error) {
    for (const row of (journal.data ?? []) as BalanceRow[]) {
      if (!row.party_id) continue;
      /* Credit-normal liability: owed = −(debit − credit). */
      balances.set(row.party_id, -Number(row.balance_minor) / 100);
    }
  } else if (!isMissingSchemaObject(journal.error)) {
    throw journal.error;
  }

  return { earnings, deliveries, balances };
}
