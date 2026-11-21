import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { monthWindowBounds } from "@/lib/kpi/calendar";

import { OperationsError } from "./errors";

import type { EmployeeOperationRow, OperationFact } from "./kpi-types";

/**
 * Tier 4 repository for the per-employee operations report.
 *
 * `operation_logs.logged_by` records the operator who entered each fulfilled
 * order. Aggregating it by month answers the KPI/payroll question without
 * touching the immutable financial columns: the money terms are read exactly
 * as they were frozen at insert time.
 */

export function isOperationsKpiConfigured(): boolean {
  return hasSupabaseConfig();
}

type OperationRow = {
  logged_by: string | null;
  order_value_minor: number;
  commission_minor: number;
  courier_cut_minor: number;
  occurred_at: string;
  users:
    | { full_name: string | null; title: string | null }
    | { full_name: string | null; title: string | null }[]
    | null;
};

const OPERATION_COLUMNS =
  "logged_by,order_value_minor,commission_minor,courier_cut_minor,occurred_at,users(full_name,title)";

const OPERATION_COLUMNS_NO_JOIN =
  "logged_by,order_value_minor,commission_minor,courier_cut_minor,occurred_at";

function toFact(row: OperationRow): OperationFact {
  const embed = Array.isArray(row.users) ? row.users[0] : row.users;
  return {
    loggedBy: row.logged_by,
    userId: row.logged_by ?? "unattributed",
    name: embed?.full_name?.trim() || "غير منسوب",
    title: embed?.title?.trim() || "",
    orderValue: Number(row.order_value_minor) / 100,
    commission: Number(row.commission_minor) / 100,
    courierCut: Number(row.courier_cut_minor) / 100,
    occurredAt: row.occurred_at,
  };
}

export async function listOperationFacts(month: string): Promise<OperationFact[]> {
  const client = getSupabaseServerClient();
  const { start, end } = monthWindowBounds(month);

  const run = (columns: string) =>
    client
      .schema("app")
      .from("operation_logs")
      .select(columns)
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("occurred_at", { ascending: false })
      .limit(5000);

  const primary = await run(OPERATION_COLUMNS);
  if (!primary.error) {
    return ((primary.data ?? []) as unknown as OperationRow[]).map(toFact);
  }
  if (!isMissingSchemaObject(primary.error)) {
    throw new OperationsError(
      "KPI_UNAVAILABLE",
      "تعذر قراءة سجل العمليات.",
      502,
    );
  }

  const fallback = await run(OPERATION_COLUMNS_NO_JOIN);
  if (fallback.error && isMissingSchemaObject(fallback.error)) return [];
  if (fallback.error) {
    throw new OperationsError(
      "KPI_UNAVAILABLE",
      "تعذر قراءة سجل العمليات.",
      502,
    );
  }
  return ((fallback.data ?? []) as unknown as OperationRow[]).map(toFact);
}

/** Folds the raw facts into one row per operator, unordered. */
export function summarizeByEmployee(
  facts: readonly OperationFact[],
): EmployeeOperationRow[] {
  const buckets = new Map<string, EmployeeOperationRow>();

  for (const fact of facts) {
    const current = buckets.get(fact.userId);
    if (current) {
      current.operationCount += 1;
      current.orderValueTotal += fact.orderValue;
      current.commissionTotal += fact.commission;
      current.courierCutTotal += fact.courierCut;
      if (!current.lastLoggedAt || fact.occurredAt > current.lastLoggedAt) {
        current.lastLoggedAt = fact.occurredAt;
      }
      continue;
    }
    buckets.set(fact.userId, {
      userId: fact.userId,
      name: fact.name,
      title: fact.title,
      operationCount: 1,
      orderValueTotal: fact.orderValue,
      commissionTotal: fact.commission,
      courierCutTotal: fact.courierCut,
      lastLoggedAt: fact.occurredAt,
    });
  }

  return [...buckets.values()];
}
