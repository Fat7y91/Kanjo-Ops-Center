import {
  BI_CHANNEL_PLATFORM,
  BI_EXPENSE_CATEGORIES,
  BI_MARKETING_CHANNELS,
  type BiExpenseRow,
  type BiMarketingRow,
} from "./types";

/**
 * Deterministic pseudo-random generator.
 *
 * The dashboard ships before the finance and marketing endpoints exist, so the
 * mock facts must be stable across server renders. A seeded LCG keeps every
 * reload identical while still producing varied, realistic figures.
 */
function createRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

type MockScope = {
  cityId: string;
  cityName: string;
  team: string;
  /** Monthly GMV in this city, used to keep mock spend proportional. */
  monthlyValue: number;
};

const EXPENSE_LABELS: Record<(typeof BI_EXPENSE_CATEGORIES)[number], string[]> = {
  field: ["وقود زيارات ميدانية", "بدل انتقال مندوبين", "صيانة أجهزة ميدانية"],
  salaries: ["رواتب فريق الميدان", "مكافآت أداء", "رواتب مكتب الكتالوج"],
  marketing: ["حملة إنستجرام", "تعاقد مؤثرين", "لوحات دعائية"],
  logistics: ["إيجار مستودع", "شحن عينات", "تغليف مواد ترويجية"],
};

const CAMPAIGNS = [
  "إطلاق القاهرة الكبرى",
  "توسع الدلتا",
  "حملة التجار الجدد",
  "إعادة تنشيط الحسابات",
  "برنامج الإحالة",
];

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(9, 0, 0, 0);
  return date.toISOString();
}

/**
 * Monthly operating budget per category, expressed as a share of the city's
 * monthly GMV. Keeping spend proportional means a small merchant book never
 * produces a nonsensical negative net position on the dashboard.
 */
const EXPENSE_SHARE: Record<(typeof BI_EXPENSE_CATEGORIES)[number], number> = {
  salaries: 0.022,
  field: 0.008,
  logistics: 0.006,
  marketing: 0.009,
};

export function buildMockExpenses(scopes: MockScope[]): BiExpenseRow[] {
  const rows: BiExpenseRow[] = [];
  scopes.forEach((scope, scopeIndex) => {
    const random = createRandom(1000 + scopeIndex * 37);
    for (let month = 0; month < 6; month += 1) {
      for (const category of BI_EXPENSE_CATEGORIES) {
        const labels = EXPENSE_LABELS[category];
        const label = labels[Math.floor(random() * labels.length)];
        const base = Math.round(
          Math.max(scope.monthlyValue, 120_000) * EXPENSE_SHARE[category],
        );
        const amount = Math.round(base * (0.75 + random() * 0.6));
        rows.push({
          id: `exp-${scope.cityId}-${category}-${month}`,
          label,
          category,
          amount,
          incurredAt: daysAgo(month * 30 + Math.floor(random() * 12)),
          cityId: scope.cityId,
          cityName: scope.cityName,
          team: scope.team,
        });
      }
    }
  });
  return rows;
}

export function buildMockMarketing(scopes: MockScope[]): BiMarketingRow[] {
  const rows: BiMarketingRow[] = [];
  scopes.forEach((scope, scopeIndex) => {
    const random = createRandom(5000 + scopeIndex * 53);
    for (let month = 0; month < 6; month += 1) {
      for (const channel of BI_MARKETING_CHANNELS) {
        const impressions = Math.round(
          (channel === "field" ? 6_000 : 48_000) * (0.6 + random() * 0.9),
        );
        const reach = Math.round(impressions * (0.42 + random() * 0.24));
        const clicks = Math.round(impressions * (0.018 + random() * 0.035));
        const leads = Math.round(clicks * (0.16 + random() * 0.2));
        rows.push({
          id: `mkt-${scope.cityId}-${channel}-${month}`,
          channel,
          platform: BI_CHANNEL_PLATFORM[channel],
          campaign: CAMPAIGNS[Math.floor(random() * CAMPAIGNS.length)],
          impressions,
          reach,
          clicks,
          leads,
          conversions: Math.round(leads * (0.18 + random() * 0.22)),
          spend: Math.round(
            Math.max(scope.monthlyValue, 120_000) *
              (channel === "field" ? 0.0016 : 0.0032) *
              (0.7 + random() * 0.8),
          ),
          occurredAt: daysAgo(month * 30 + Math.floor(random() * 10)),
          cityId: scope.cityId,
          cityName: scope.cityName,
          team: scope.team,
        });
      }
    }
  });
  return rows;
}

/**
 * Finance target used by the negotiation efficiency gauge.
 *
 * Derived from the scoped merchants so the target scales with the viewer's
 * city scope instead of using one global constant.
 */
export function commissionTarget(monthlyValueSum: number, margin = 0.09): number {
  return Math.round(monthlyValueSum * margin);
}
