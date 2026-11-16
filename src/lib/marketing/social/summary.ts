import {
  EMPTY_SOCIAL_SUMMARY,
  type SocialAccountSummary,
  type SocialMetricRow,
  type SocialSummary,
} from "./types";

type AccountSeries = {
  platform: SocialMetricRow["platform"];
  accountId: string;
  accountName: string;
  rows: SocialMetricRow[];
};

function seriesKey(row: SocialMetricRow): string {
  return `${row.platform}:${row.accountId}`;
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function buildTrend(series: AccountSeries[]): number[] {
  const byDay = new Map<string, Map<string, number>>();
  for (const account of series) {
    const key = seriesKey(account.rows[0]);
    const days = byDay.get(key) ?? new Map<string, number>();
    for (const row of account.rows) {
      days.set(dayOf(row.capturedAt), row.followers);
    }
    byDay.set(key, days);
  }

  const days = Array.from(
    new Set(
      series.flatMap((account) => account.rows.map((row) => dayOf(row.capturedAt))),
    ),
  ).sort();

  const lastKnown = new Map<string, number>();
  return days.map((day) => {
    for (const [key, values] of byDay) {
      const value = values.get(day);
      if (value !== undefined) lastKnown.set(key, value);
    }
    return Array.from(lastKnown.values()).reduce(
      (total, value) => total + value,
      0,
    );
  });
}

export function buildSocialSummary(rows: SocialMetricRow[]): SocialSummary {
  if (rows.length === 0) return EMPTY_SOCIAL_SUMMARY;

  const grouped = new Map<string, AccountSeries>();
  for (const row of rows) {
    const key = seriesKey(row);
    const current = grouped.get(key);
    if (current) {
      current.rows.push(row);
      continue;
    }
    grouped.set(key, {
      platform: row.platform,
      accountId: row.accountId,
      accountName: row.accountName,
      rows: [row],
    });
  }

  const series = Array.from(grouped.values()).map((account) => ({
    ...account,
    rows: [...account.rows].sort((left, right) =>
      left.capturedAt.localeCompare(right.capturedAt),
    ),
  }));

  const accounts: SocialAccountSummary[] = series
    .map((account) => {
      const daily = new Map<string, SocialMetricRow>();
      for (const row of account.rows) daily.set(dayOf(row.capturedAt), row);
      const days = Array.from(daily.keys()).sort();
      const first = daily.get(days[0]);
      const latest = daily.get(days[days.length - 1]) ?? account.rows[0];
      return {
        platform: account.platform,
        accountId: account.accountId,
        accountName: account.accountName || latest.accountId,
        followers: latest.followers,
        likes: latest.likes,
        delta: latest.followers - (first?.followers ?? latest.followers),
        capturedAt: latest.capturedAt,
      };
    })
    .sort(
      (left, right) =>
        right.followers - left.followers ||
        left.accountName.localeCompare(right.accountName),
    );

  return {
    followers: accounts.reduce((total, account) => total + account.followers, 0),
    likes: accounts.reduce((total, account) => total + account.likes, 0),
    capturedAt:
      accounts
        .map((account) => account.capturedAt)
        .sort()
        .at(-1) ?? null,
    trend: buildTrend(series),
    accounts,
  };
}
