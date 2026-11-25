import type {
  ClearingAccountRow,
  StatementRange,
} from "./types";
import { filterClearingAccounts } from "./clearinghouse-view";

export type ClearingReportKind = "collections" | "payables";

export type AccountPeriodStats = {
  orderCount: number;
  debitMinor: number;
  creditMinor: number;
};

export type ClearingReportRow = {
  accountId: string;
  partyName: string;
  partyType: ClearingAccountRow["partyType"];
  currency: ClearingAccountRow["currency"];
  orderCount: number;
  workingDays: number | null;
  debit: number;
  credit: number;
  net: number;
};

export type ClearingReport = {
  kind: ClearingReportKind;
  title: string;
  periodLabel: string;
  generatedAt: string;
  from: string | null;
  to: string | null;
  currency: ClearingAccountRow["currency"];
  rows: ClearingReportRow[];
  totals: {
    orders: number;
    workingDays: number;
    debit: number;
    credit: number;
    net: number;
  };
};

function inRange(day: string, range: StatementRange): boolean {
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Recomputes the report totals from its own rows.
 *
 * The Print modal uses this instead of trusting a possibly stale `totals`, so
 * the KPI cards, the footer and the exported rows can never disagree.
 */
export function clearingReportTotals(
  rows: readonly ClearingReportRow[],
): ClearingReport["totals"] {
  return rows.reduce(
    (sum, row) => ({
      orders: sum.orders + row.orderCount,
      workingDays: sum.workingDays + (row.workingDays ?? 0),
      debit: round2(sum.debit + row.debit),
      credit: round2(sum.credit + row.credit),
      net: round2(sum.net + Math.abs(row.net)),
    }),
    { orders: 0, workingDays: 0, debit: 0, credit: 0, net: 0 },
  );
}

export function clearingRangeLabel(range: StatementRange): string {
  if (!range.from && !range.to) return "كل الفترات";
  return `${range.from ?? "البداية"} ← ${range.to ?? "الآن"}`;
}

export function clearingReportTitle(kind: ClearingReportKind): string {
  return kind === "collections"
    ? "كشف إجمالي التحصيلات المعتمدة"
    : "كشف إجمالي السدادات والمستحقات";
}

/** True for a courier whose payables are excluded from the settlement scope. */
export function isInternalCourier(
  account: ClearingAccountRow,
  excludeInternal: boolean,
): boolean {
  return (
    excludeInternal &&
    account.partyType === "courier" &&
    Boolean(account.isInternalStaff)
  );
}

/**
 * The exact accounts a master report prints and exports.
 *
 * One definition is shared by the server report and the client's on-screen
 * slice, so the toggle, the date window and the debit/credit side always agree
 * between the KPI cards, the Print modal and the Excel workbook.
 */
export function selectClearingReportAccounts(input: {
  accounts: readonly ClearingAccountRow[];
  kind: ClearingReportKind;
  range: StatementRange;
  excludeInternal: boolean;
}): ClearingAccountRow[] {
  return filterClearingAccounts(input.accounts, input.range)
    .filter((account) =>
      input.kind === "collections" ? account.balance > 0 : account.balance < 0,
    )
    .filter((account) => !isInternalCourier(account, input.excludeInternal))
    .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance));
}

export function buildClearingReport(input: {
  kind: ClearingReportKind;
  accounts: readonly ClearingAccountRow[];
  stats: ReadonlyMap<string, AccountPeriodStats>;
  range: StatementRange;
  periodLabel: string;
  generatedAt: string;
}): ClearingReport {
  const rows = input.accounts.map((account) => {
    const stat = input.stats.get(account.accountId);
    const workingDays =
      account.partyType === "courier"
        ? (account.workingDates ?? []).filter((day) =>
            inRange(day, input.range),
          ).length
        : null;

    return {
      accountId: account.accountId,
      partyName: account.partyName,
      partyType: account.partyType,
      currency: account.currency,
      orderCount: stat?.orderCount ?? 0,
      workingDays,
      debit: round2((stat?.debitMinor ?? 0) / 100),
      credit: round2((stat?.creditMinor ?? 0) / 100),
      net: account.balance,
    } satisfies ClearingReportRow;
  });

  const totals = clearingReportTotals(rows);

  return {
    kind: input.kind,
    title: clearingReportTitle(input.kind),
    periodLabel: input.periodLabel,
    generatedAt: input.generatedAt,
    from: input.range.from,
    to: input.range.to,
    currency: input.accounts[0]?.currency ?? "EGP",
    rows,
    totals,
  };
}
