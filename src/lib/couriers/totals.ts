import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { summarizeCourierOperations } from "./monthly";

/**
 * Tier 4 aggregates for the couriers roster.
 *
 * Earnings and delivery counts come from the append-only operations log. The
 * outstanding balance comes from the double-entry journal: a courier's ledger
 * account under `2100` is a liability, so a positive "owed to courier" figure
 * is the negation of its `debit − credit` balance. Nothing is stored.
 *
 * The monthly figures answer a different question — "how did this partner
 * perform this month?" — and are scoped to the current calendar month (UTC).
 * The arithmetic lives in `monthly.ts` so it is unit-testable; this module only
 * reads and converts.
 */

export type CourierTotals = ReturnType<typeof summarizeCourierOperations> & {
  balances: Map<string, number>;
};

type OperationRow = {
  courier_id: string;
  courier_cut_minor: number;
  order_value_minor: number;
  delivery_fee_minor: number;
  occurred_at: string;
};

type BalanceRow = {
  party_id: string | null;
  balance_minor: number;
};

export async function loadCourierTotals(): Promise<CourierTotals> {
  const client = getSupabaseServerClient();
  const balances = new Map<string, number>();

  const operations = await client
    .schema("app")
    .from("operation_logs")
    .select(
      "courier_id,courier_cut_minor,order_value_minor,delivery_fee_minor,occurred_at",
    )
    .limit(5000);

  let operationRows: OperationRow[] = [];
  if (!operations.error) {
    operationRows = (operations.data ?? []) as OperationRow[];
  } else if (!isMissingSchemaObject(operations.error)) {
    throw operations.error;
  }

  const totals = summarizeCourierOperations(
    operationRows.map((row) => ({
      courierId: row.courier_id,
      profit: Number(row.courier_cut_minor) / 100,
      gross:
        (Number(row.order_value_minor) + Number(row.delivery_fee_minor)) / 100,
      occurredAt: row.occurred_at,
    })),
    new Date(),
  );

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

  return { ...totals, balances };
}
