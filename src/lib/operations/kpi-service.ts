import "server-only";

import { currentMonthKey, isMonthKey } from "@/lib/kpi/calendar";

import {
  isOperationsKpiConfigured,
  listOperationFacts,
  summarizeByEmployee,
} from "./kpi-repository";
import type { OperationsKpiReport } from "./kpi-types";
import { OperationsError } from "./errors";

/**
 * Tier 3 rules for the per-employee operations report.
 *
 * The report is descriptive, not a payslip: it counts operations and sums the
 * frozen money terms per operator. The payroll engine still owns the actual
 * salary computation; this surface is the evidence a manager reviews beside it.
 */

export function isOperationsKpiDatabaseConfigured(): boolean {
  return isOperationsKpiConfigured();
}

export function normalizeMonth(value: string | null | undefined): string {
  const month = (value ?? "").trim();
  return isMonthKey(month) ? month : currentMonthKey();
}

export async function loadOperationsKpiReport(
  monthInput: string | null | undefined,
): Promise<OperationsKpiReport> {
  if (!isOperationsKpiConfigured()) {
    throw new OperationsError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }

  const month = normalizeMonth(monthInput);
  const facts = await listOperationFacts(month);
  const rows = summarizeByEmployee(facts).sort(
    (left, right) => right.operationCount - left.operationCount,
  );

  const totals = rows.reduce(
    (acc, row) => ({
      operationCount: acc.operationCount + row.operationCount,
      orderValueTotal: acc.orderValueTotal + row.orderValueTotal,
      commissionTotal: acc.commissionTotal + row.commissionTotal,
      courierCutTotal: acc.courierCutTotal + row.courierCutTotal,
    }),
    {
      operationCount: 0,
      orderValueTotal: 0,
      commissionTotal: 0,
      courierCutTotal: 0,
    },
  );

  return { month, rows, totals };
}
