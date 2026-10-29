import type { FollowUpTask, FieldTask, Merchant, VisitReport } from "@/lib/field-ops/types";
import type { CityStage } from "@/lib/field-ops/types";
import type { CatalogProduct } from "@/lib/catalog/types";

/**
 * Agent KPI domain vocabulary (Tier 3).
 *
 * These types are the contract between the KPI service, the repository and the
 * dashboard. Raw records (`KpiScoutEntry`, `KpiLiveOpsDay`, `KpiUsageSession`)
 * represent feeds that do not yet live in a domain store; they are seeded in
 * `data/facts-seed.ts` until the Consumer app exposes them.
 */

export type KpiStage = CityStage;

export const KPI_STAGE_ORDER: readonly KpiStage[] = [
  "preparation",
  "contracting",
  "data_entry",
  "live_operations",
];

export const KPI_STAGE_META: Record<
  KpiStage,
  { label: string; code: string; description: string }
> = {
  preparation: {
    label: "الإعداد والاستكشاف",
    code: "المرحلة 1",
    description: "حصر التجار المستهدفين وتقييم جودة البيانات قبل التعاقد.",
  },
  contracting: {
    label: "التعاقدات",
    code: "المرحلة 2",
    description: "الزيارات والتفاوض ونسبة تحقيق المستهدف والتوقيعات.",
  },
  data_entry: {
    label: "إدخال البيانات",
    code: "المرحلة 3",
    description: "رقمنة التجار والمنتجات وتغطية الصور ودقة الكتالوج.",
  },
  live_operations: {
    label: "التشغيل الفعلي",
    code: "المرحلة 4",
    description: "الطلبات اليومية والإيراد والتذاكر والتحصيل النقدي.",
  },
};

/* ── Raw feeds ─────────────────────────────────────────────────────────── */

export type KpiScoutEntry = {
  agentId: string;
  merchantName: string;
  description: string;
  createdAt: string;
};

export type KpiLiveOpsDay = {
  agentId: string;
  date: string;
  shiftOrders: number;
  gmv: number;
  ticketsResolved: number;
  merchantsContacted: number;
  rejectedOrders: number;
  activeMerchants: number;
  cashMerchants: number;
  cashDrivers: number;
};

export type KpiUsageSession = {
  agentId: string;
  date: string;
  minutes: number;
};

/* ── Roster and dataset ────────────────────────────────────────────────── */

export type KpiCity = {
  id: string;
  name: string;
  stage: KpiStage;
};

export type KpiAgent = {
  id: string;
  name: string;
  team: string;
  cityId: string;
  cityName: string;
  stage: KpiStage;
};

export type KpiDataset = {
  cities: KpiCity[];
  agents: KpiAgent[];
  merchants: Merchant[];
  reports: VisitReport[];
  tasks: FieldTask[];
  followUps: FollowUpTask[];
  products: CatalogProduct[];
  scouts: KpiScoutEntry[];
  liveOps: KpiLiveOpsDay[];
  usage: KpiUsageSession[];
};

/* ── Computed facts ────────────────────────────────────────────────────── */

export type PreparationFacts = {
  merchantsScouted: number;
  avgDescriptionLength: number;
};

export type NegotiationFacts = {
  merchantsVisited: number;
  totalVisits: number;
  followUps: number;
  reportsWritten: number;
  avgReportLength: number;
  targetPercent: number;
  finalContractPercent: number;
  provisionalContractPercent: number;
  avgVisitDurationMinutes: number;
};

export type DataEntryFacts = {
  merchantsDigitized: number;
  totalProducts: number;
  imagesUploaded: number;
  productsMissingImages: number;
  catalogAccuracy: number;
  avgDescriptionLength: number;
};

export type LiveOpsFacts = {
  dailyShiftOrders: number;
  totalGmv: number;
  ticketsResolved: number;
  merchantsContacted: number;
  rejectedOrders: number;
  activeMerchants: number;
  cashCollectedMerchants: number;
  cashCollectedDrivers: number;
};

export type UsageFacts = {
  activeMinutes: number;
  activeDays: number;
  sessions: number;
  avgSessionMinutes: number;
};

export type AgentKpiFacts = {
  preparation: PreparationFacts;
  negotiation: NegotiationFacts;
  dataEntry: DataEntryFacts;
  liveOps: LiveOpsFacts;
  usage: UsageFacts;
};

/* ── Presentation contract ─────────────────────────────────────────────── */

export type KpiMetricUnit =
  | "count"
  | "percent"
  | "currency"
  | "minutes"
  | "characters";

export type KpiMetricDirection = "higher" | "lower" | "neutral";

export type KpiMetric = {
  key: string;
  label: string;
  value: number;
  unit: KpiMetricUnit;
  hint: string;
  direction: KpiMetricDirection;
};

export type KpiRank = {
  position: number;
  total: number;
  cityId: string;
  cityName: string;
};

export type KpiInsightTone = "focus" | "strength" | "neutral";

export type KpiInsight = {
  id: string;
  tone: KpiInsightTone;
  title: string;
  body: string;
};

export type KpiSnapshot = {
  agent: KpiAgent;
  stage: KpiStage;
  stageLabel: string;
  facts: AgentKpiFacts;
  metrics: KpiMetric[];
  usageMetrics: KpiMetric[];
  score: number;
  rank: KpiRank;
  topPerformer: {
    agentId: string;
    name: string;
    score: number;
    isSelf: boolean;
  };
  insights: KpiInsight[];
};

export type KpiReport = {
  snapshots: KpiSnapshot[];
  generatedFor: string;
  cityCount: number;
};

export type KpiScope = {
  cityIds: readonly string[];
  team?: string | null;
  agentIds?: readonly string[];
};

export type KpiErrorCode =
  | "AGENT_NOT_FOUND"
  | "CITY_NOT_FOUND"
  | "EMPTY_SCOPE";

export class KpiError extends Error {
  readonly code: KpiErrorCode;
  readonly status: number;

  constructor(code: KpiErrorCode, message: string, status = 400) {
    super(message);
    this.name = "KpiError";
    this.code = code;
    this.status = status;
  }
}
