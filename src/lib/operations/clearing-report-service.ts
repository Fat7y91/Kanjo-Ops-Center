import "server-only";

import { listClearingAccounts } from "./clearinghouse-repository";
import { filterClearingAccounts } from "./clearinghouse-view";
import {
  buildClearingReport,
  clearingRangeLabel,
  type ClearingReport,
  type ClearingReportKind,
} from "./clearing-report";
import { listAccountPeriodStats } from "./clearing-report-repository";
import { requireOperationsDatabase, translateOperationError } from "./service-guards";
import type { StatementRange } from "./types";

export async function loadClearingReport(
  kind: ClearingReportKind,
  range: StatementRange,
): Promise<ClearingReport> {
  requireOperationsDatabase();

  try {
    const accounts = await listClearingAccounts();
    const scoped = filterClearingAccounts(accounts, range)
      .filter((account) =>
        kind === "collections" ? account.balance > 0 : account.balance < 0,
      )
      .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance));

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
