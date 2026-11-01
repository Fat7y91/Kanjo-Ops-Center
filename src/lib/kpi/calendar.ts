/**
 * KPI month calendar helpers (Tier 3, pure).
 *
 * Months are the vault's time axis: `YYYY-MM` keys, first-day bounds in UTC.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function isMonthKey(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

export function monthWindowBounds(month: string): {
  start: string;
  end: string;
} {
  const [year, monthPart] = month.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, monthPart - 1, 1));
  const endDate = new Date(Date.UTC(year, monthPart, 1));
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

export function isCurrentMonth(month: string): boolean {
  return month === currentMonthKey();
}

export function monthLabel(month: string): string {
  const [year, monthPart] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthPart - 1, 1));
  return new Intl.DateTimeFormat("ar-EG", {
    month: "long",
    year: "numeric",
  }).format(date);
}

/** The current month plus the previous `count - 1` months, oldest last. */
export function recentMonthKeys(count = 6): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    keys.push(date.toISOString().slice(0, 7));
  }
  return keys;
}
