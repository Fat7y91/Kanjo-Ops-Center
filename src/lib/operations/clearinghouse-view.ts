import type { ClearingAccountRow } from "./types";

/**
 * Pure view helpers for the settlement screen: period window, account
 * membership, sorting and per-courier working days. Kept free of React and the
 * database so the toolbar and the export share one definition of "the slice".
 */

export const CLEARING_PERIODS = ["all", "today", "7d", "month", "custom"] as const;
export type ClearingPeriod = (typeof CLEARING_PERIODS)[number];

export const CLEARING_SORTS = [
  "recent",
  "oldest_unsettled",
  "amount_desc",
  "amount_asc",
] as const;
export type ClearingSort = (typeof CLEARING_SORTS)[number];

export const CLEARING_SORT_LABEL: Record<ClearingSort, string> = {
  recent: "الأحدث نشاطاً",
  oldest_unsettled: "الأقدم بدون تسوية",
  amount_desc: "الأعلى مبلغاً",
  amount_asc: "الأقل مبلغاً",
};

export type ClearingPeriodState = {
  period: ClearingPeriod;
  from: string;
  to: string;
};

export const DEFAULT_CLEARING_PERIOD: ClearingPeriodState = {
  period: "all",
  from: "",
  to: "",
};

export type ClearingRange = { from: string | null; to: string | null };

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Resolves the toolbar selection into an inclusive `[from, to]` day range.
 * `all` has no bounds; presets anchor on `now` (UTC) so they match the journal's
 * `entry_date`.
 */
export function resolveClearingRange(
  state: ClearingPeriodState,
  now: Date = new Date(),
): ClearingRange {
  const today = isoDay(now);
  switch (state.period) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: isoDay(shiftDays(now, -6)), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "custom":
      return { from: state.from || null, to: state.to || null };
    default:
      return { from: null, to: null };
  }
}

export function withinClearingRange(
  day: string | null | undefined,
  range: ClearingRange,
): boolean {
  if (!range.from && !range.to) return true;
  if (!day) return false;
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

function hasActivity(
  account: ClearingAccountRow,
  range: ClearingRange,
): boolean {
  if (!range.from && !range.to) return true;
  if (withinClearingRange(account.lastActivityAt, range)) return true;
  if (withinClearingRange(account.lastSettlementAt, range)) return true;
  return (account.workingDates ?? []).some((day) =>
    withinClearingRange(day, range),
  );
}

export function filterClearingAccounts(
  accounts: readonly ClearingAccountRow[],
  range: ClearingRange,
): ClearingAccountRow[] {
  return accounts.filter((account) => hasActivity(account, range));
}

/**
 * One definition of an internal delivery partner for both the settlement
 * screen and every report/export. The ledger flag is authoritative; the name
 * check keeps a legacy or unlinked ZEMBAWY account out of the scope too.
 */
const INTERNAL_COURIER_NAME = /zembawy/i;

export function isInternalCourierAccount(
  account: ClearingAccountRow,
): boolean {
  return (
    account.partyType === "courier" &&
    (Boolean(account.isInternalStaff) ||
      INTERNAL_COURIER_NAME.test(account.partyName))
  );
}

export function clearingWorkingDays(
  account: ClearingAccountRow,
  range: ClearingRange,
): number {
  return (account.workingDates ?? []).filter((day) =>
    withinClearingRange(day, range),
  ).length;
}

function recentValue(account: ClearingAccountRow): string {
  return [account.lastActivityAt, account.lastSettlementAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? "";
}

export function sortClearingAccounts(
  accounts: readonly ClearingAccountRow[],
  sort: ClearingSort,
): ClearingAccountRow[] {
  const copy = [...accounts];
  switch (sort) {
    case "amount_desc":
      return copy.sort(
        (left, right) => Math.abs(right.balance) - Math.abs(left.balance),
      );
    case "amount_asc":
      return copy.sort(
        (left, right) => Math.abs(left.balance) - Math.abs(right.balance),
      );
    case "oldest_unsettled":
      return copy.sort((left, right) => {
        const settled = (left.lastSettlementAt ?? "").localeCompare(
          right.lastSettlementAt ?? "",
        );
        if (settled !== 0) return settled;
        return recentValue(left).localeCompare(recentValue(right));
      });
    default:
      return copy.sort((left, right) =>
        recentValue(right).localeCompare(recentValue(left)),
      );
  }
}

export function clearingPeriodLabel(
  state: ClearingPeriodState,
  range: ClearingRange,
): string {
  switch (state.period) {
    case "today":
      return "اليوم";
    case "7d":
      return "آخر 7 أيام";
    case "month":
      return "هذا الشهر";
    case "custom":
      return `${range.from ?? "البداية"} ← ${range.to ?? "الآن"}`;
    default:
      return "كل الفترات";
  }
}
