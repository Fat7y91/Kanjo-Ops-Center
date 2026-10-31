import {
  BI_DEAL_STAGES,
  BI_DOCUMENT_KEYS,
  type BiDataset,
  type BiDealStage,
  type BiDocumentKey,
  type BiFilters,
  type BiMarketingChannel,
  type BiMerchantRow,
} from "./types";

const RANGE_DAYS: Record<BiFilters["range"], number | null> = {
  "30d": 30,
  "90d": 90,
  ytd: null,
  all: null,
};

/**
 * Resolves the active window into an inclusive lower bound.
 * `ytd` starts at January 1st of the current year; `all` has no bound.
 */
export function rangeStart(range: BiFilters["range"]): Date | null {
  if (range === "all") return null;
  if (range === "ytd") {
    return new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  }
  const days = RANGE_DAYS[range] ?? 0;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return start;
}

function withinRange(iso: string | null, start: Date | null): boolean {
  if (!start) return true;
  if (!iso) return false;
  return new Date(iso).getTime() >= start.getTime();
}

export type BiScopedData = {
  merchants: BiMerchantRow[];
  expenses: BiDataset["expenses"];
  marketing: BiDataset["marketing"];
  catalog: BiDataset["catalog"];
  /**
   * Treasury facts are company-wide: a bank account or payslip is not owned by
   * a city or a team, so the universal filter bar does not narrow them. They
   * ride along untouched so the drill-down panels stay in sync with the cards.
   */
  accounts: BiDataset["accounts"];
  ledger: BiDataset["ledger"];
  payslips: BiDataset["payslips"];
};

/**
 * Applies the universal filter bar to every fact table.
 *
 * Merchants use their last visit to decide window membership so a merchant
 * signed before the window does not inflate this period's funnel; expenses,
 * marketing rows and catalog entries filter on their own timestamps.
 */
export function scopeDataset(
  dataset: BiDataset,
  filters: BiFilters,
): BiScopedData {
  const start = rangeStart(filters.range);

  const cityOk = (cityId: string) =>
    !filters.cityId || cityId === filters.cityId;
  const teamOk = (team: string) => !filters.team || team === filters.team;
  const repOk = (repId: string | null) => !filters.repId || repId === filters.repId;
  const vendorTypeOk = (vendorTypeId: number | null) =>
    filters.vendorTypeId === null || vendorTypeId === filters.vendorTypeId;

  return {
    merchants: dataset.merchants.filter(
      (row) =>
        cityOk(row.cityId) &&
        teamOk(row.team) &&
        repOk(row.repId) &&
        vendorTypeOk(row.vendorTypeId) &&
        withinRange(row.lastVisitAt ?? row.visitedAt, start),
    ),
    expenses: dataset.expenses.filter(
      (row) =>
        cityOk(row.cityId) &&
        teamOk(row.team) &&
        withinRange(row.incurredAt, start),
    ),
    marketing: dataset.marketing.filter(
      (row) =>
        cityOk(row.cityId) &&
        teamOk(row.team) &&
        withinRange(row.occurredAt, start),
    ),
    catalog: dataset.catalog.filter(
      (row) => cityOk(row.cityId) && teamOk(row.team),
    ),
    accounts: dataset.accounts,
    ledger: dataset.ledger,
    payslips: dataset.payslips,
  };
}

export type FunnelStep = {
  stage: BiDealStage;
  count: number;
  share: number;
};

export function buildFunnel(merchants: BiMerchantRow[]): FunnelStep[] {
  const visited = merchants.length;
  const counts = new Map<BiDealStage, number>();
  for (const stage of BI_DEAL_STAGES) counts.set(stage, 0);
  counts.set("visited", visited);

  for (const merchant of merchants) {
    counts.set(merchant.stage, (counts.get(merchant.stage) ?? 0) + 1);
  }

  const top = Math.max(visited, 1);
  return BI_DEAL_STAGES.map((stage) => ({
    stage,
    count: counts.get(stage) ?? 0,
    share: (counts.get(stage) ?? 0) / top,
  }));
}

export type ComplianceBreakdown = {
  key: BiDocumentKey;
  complete: number;
  missing: number;
  total: number;
  rate: number;
};

export function buildCompliance(
  merchants: BiMerchantRow[],
): ComplianceBreakdown[] {
  const total = merchants.length;
  return BI_DOCUMENT_KEYS.map((key) => {
    const complete = merchants.filter((row) => row.documents[key]).length;
    return {
      key,
      complete,
      missing: total - complete,
      total,
      rate: total === 0 ? 0 : complete / total,
    };
  });
}

export type NegotiationRow = {
  stage: BiDealStage;
  label: string;
  target: number;
  achieved: number;
};

/**
 * Target vs achieved commission for the stages where a number exists.
 *
 * `no_contract` is excluded because a zero target would produce a meaningless
 * ratio; the gauge compares only negotiated deals.
 */
export function buildNegotiation(
  merchants: BiMerchantRow[],
): NegotiationRow[] {
  const relevant = merchants.filter((row) => row.stage !== "no_contract");
  const stages: BiDealStage[] = ["provisional", "final", "signed"];
  return stages.map((stage) => {
    const bucket = relevant.filter((row) => row.stage === stage);
    const target = average(bucket.map((row) => row.targetCommission));
    const achieved = average(bucket.map((row) => row.achievedCommission));
    return {
      stage,
      label: stage,
      target,
      achieved,
    };
  });
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type FinanceSummary = {
  collected: number;
  expenses: number;
  net: number;
  marginRate: number;
  monthlyRunRate: number;
  signedCount: number;
};

export function buildFinance(
  merchants: BiMerchantRow[],
  expenses: BiScopedData["expenses"],
): FinanceSummary {
  const collected = sum(merchants.map((row) => row.collected));
  const expenseTotal = sum(expenses.map((row) => row.amount));
  const monthlyValue = sum(merchants.map((row) => row.monthlyValue));

  return {
    collected,
    expenses: expenseTotal,
    net: Math.round(collected - expenseTotal),
    marginRate:
      monthlyValue === 0
        ? 0
        : sum(merchants.map((row) => row.achievedCommission)) /
          merchants.length /
          100,
    monthlyRunRate: Math.round(monthlyValue),
    signedCount: merchants.filter((row) => row.stage === "signed").length,
  };
}

export type MarketingSummary = {
  reach: number;
  impressions: number;
  leads: number;
  conversions: number;
  spend: number;
  costPerLead: number;
  conversionRate: number;
  byChannel: Array<{
    channel: BiMarketingChannel;
    reach: number;
    leads: number;
    spend: number;
  }>;
};

export function buildMarketing(
  rows: BiScopedData["marketing"],
): MarketingSummary {
  const reach = sum(rows.map((row) => row.reach));
  const leads = sum(rows.map((row) => row.leads));
  const spend = sum(rows.map((row) => row.spend));
  const conversions = sum(rows.map((row) => row.conversions));

  const channelMap = new Map<
    BiMarketingChannel,
    { reach: number; leads: number; spend: number }
  >();
  for (const row of rows) {
    const current = channelMap.get(row.channel) ?? {
      reach: 0,
      leads: 0,
      spend: 0,
    };
    channelMap.set(row.channel, {
      reach: current.reach + row.reach,
      leads: current.leads + row.leads,
      spend: current.spend + row.spend,
    });
  }

  return {
    reach,
    impressions: sum(rows.map((row) => row.impressions)),
    leads,
    conversions,
    spend,
    costPerLead: leads === 0 ? 0 : Math.round(spend / leads),
    conversionRate: leads === 0 ? 0 : conversions / leads,
    byChannel: Array.from(channelMap.entries()).map(([channel, value]) => ({
      channel,
      ...value,
    })),
  };
}

export type CatalogSummary = {
  published: number;
  missing: number;
  total: number;
  readiness: number;
};

export function buildCatalog(
  rows: BiScopedData["catalog"],
): CatalogSummary {
  const published = rows.filter((row) => row.state === "published").length;
  const missing = rows.filter((row) => row.state === "missing").length;
  const total = published + missing;
  return {
    published,
    missing,
    total,
    readiness: total === 0 ? 0 : published / total,
  };
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
