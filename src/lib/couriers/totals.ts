import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Tier 4 aggregates for the couriers roster.
 *
 * Earnings, delivery counts and the pending clearing balance are folded from
 * the operations append-only log and the clearinghouse ledger. Kept apart from
 * the roster repository so each file answers one question.
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

type LedgerRow = {
  courier_id: string | null;
  amount_minor: number;
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

  const ledgers = await client
    .schema("app")
    .from("financial_ledgers")
    .select("courier_id,amount_minor")
    .eq("entity_type", "courier")
    .eq("status", "pending")
    .limit(5000);

  if (!ledgers.error) {
    for (const row of (ledgers.data ?? []) as LedgerRow[]) {
      if (!row.courier_id) continue;
      const current = balances.get(row.courier_id) ?? 0;
      balances.set(row.courier_id, current + Number(row.amount_minor) / 100);
    }
  } else if (!isMissingSchemaObject(ledgers.error)) {
    throw ledgers.error;
  }

  return { earnings, deliveries, balances };
}
