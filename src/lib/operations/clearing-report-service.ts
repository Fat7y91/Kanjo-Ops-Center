import "server-only";

import { listClearingAccounts } from "./clearinghouse-repository";
import {
  buildClearingReport,
  clearingRangeLabel,
  selectClearingReportAccounts,
  type ClearingReport,
  type ClearingReportKind,
} from "./clearing-report";
import { listAccountPeriodStats } from "./clearing-report-repository";
import { requireOperationsDatabase, translateOperationError } from "./service-guards";
import type { StatementRange } from "./types";

export async function loadClearingReport(
  kind: ClearingReportKind,
  range: StatementRange,
  excludeInternal = false,
  canViewInternal = false,
): Promise<ClearingReport> {
  requireOperationsDatabase();

  try {
    const accounts = await listClearingAccounts();
    const scoped = selectClearingReportAccounts({
      accounts,
      kind,
      range,
      excludeInternal,
      canViewInternal,
    });

    const stats = await listAccountPeriodStats(
      scoped.map((account) => account.accountId),
      range,
    );

    return buildClearingReport({
      kind,
      accounts: scoped,
      stats,
      range,
      periodLabel: clearingRangeLabel(range),
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    });
  } catch (error) {
    translateOperationError(error);
  }
}
