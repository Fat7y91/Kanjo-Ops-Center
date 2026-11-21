import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { listExpenseCategories } from "./categories";
import type { ExpenseCategory } from "./types";

/**
 * Expense report read model.
 *
 * One line per movement, in either currency, from `app.expense_report_lines`.
 * EGP lines are categorized journal expenses; SAR lines are the expense table.
 * Grouping happens here so the report and the CSV export (when added) share the
 * same arithmetic as the table the operator reads.
 */

export type ExpenseReportFilters = {
  from?: string;
  to?: string;
  categoryId?: string;
};

export type ExpenseReportLine = {
  id: string;
  currency: "EGP" | "SAR";
  categoryId: string;
  categoryName: string;
  amount: number;
  occurredOn: string;
  description: string;
};

export type ExpenseCategoryGroup = {
  categoryId: string;
  categoryName: string;
  egp: number;
  sar: number;
  count: number;
};

export type ExpenseReport = {
  categories: ExpenseCategory[];
  lines: ExpenseReportLine[];
  groups: ExpenseCategoryGroup[];
  totals: { egp: number; sar: number; count: number };
};

type Row = {
  currency: string;
  movement_id: string;
  category_id: string;
  category_name: string;
  amount: number | string;
  occurred_on: string;
  description: string | null;
};

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function loadExpenseReport(
  filters: ExpenseReportFilters,
): Promise<ExpenseReport> {
  const client = getSupabaseServerClient();
  let query = client
    .schema("app")
    .from("expense_report_lines")
    .select(
      "currency,movement_id,category_id,category_name,amount,occurred_on,description",
    );
  if (filters.from) query = query.gte("occurred_on", filters.from);
  if (filters.to) query = query.lte("occurred_on", filters.to);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);

  const [{ data, error }, categories] = await Promise.all([
    query
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5000)
      .abortSignal(AbortSignal.timeout(8_000)),
    listExpenseCategories({ includeInactive: true }),
  ]);

  if (error) {
    if (isMissingSchemaObject(error)) {
      return {
        categories,
        lines: [],
        groups: [],
        totals: { egp: 0, sar: 0, count: 0 },
      };
    }
    throw error;
  }

  const lines: ExpenseReportLine[] = [];
  for (const row of (data ?? []) as Row[]) {
    const currency = row.currency === "SAR" ? "SAR" : "EGP";
    const value = Number(row.amount);
    if (!Number.isFinite(value) || value <= 0) continue;
    lines.push({
      id: `${currency.toLowerCase()}:${row.movement_id}`,
      currency,
      categoryId: row.category_id,
      categoryName: row.category_name,
      amount: money(value),
      occurredOn: row.occurred_on,
      description: row.description?.trim() ?? "",
    });
  }

  const groups = new Map<string, ExpenseCategoryGroup>();
  const totals = { egp: 0, sar: 0, count: 0 };

  for (const line of lines) {
    const current = groups.get(line.categoryId) ?? {
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      egp: 0,
      sar: 0,
      count: 0,
    };
    if (line.currency === "EGP") {
      current.egp = money(current.egp + line.amount);
      totals.egp = money(totals.egp + line.amount);
    } else {
      current.sar = money(current.sar + line.amount);
      totals.sar = money(totals.sar + line.amount);
    }
    current.count += 1;
    totals.count += 1;
    groups.set(line.categoryId, current);
  }

  return {
    categories,
    lines,
    groups: [...groups.values()].sort(
      (left, right) =>
        right.egp + right.sar - (left.egp + left.sar) ||
        left.categoryName.localeCompare(right.categoryName, "ar"),
    ),
    totals,
  };
}
