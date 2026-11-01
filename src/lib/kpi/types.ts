import type { CityStage } from "@/lib/field-ops/types";
import type {
  LiveVault,
  VaultRate,
  VaultSnapshotFact,
  VaultTeamContracting,
} from "@/lib/kpi/vault";

/**
 * Agent KPI domain vocabulary (Tier 3).
 *
 * The numbers themselves come from the SQL KPI Vault (`app` schema): live
 * per-record attribution for the current month and immutable
 * `app.kpi_snapshots` for history. The `KpiDataset` carries the raw vault
 * inputs plus the roster; `metrics.ts` turns them into facts and salary.
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
  /** `app.field_teams.id` when the rep belongs to a city-owned team. */
  teamId?: string | null;
  cityId: string;
  cityName: string;
  stage: KpiStage;
};

/** Raw vault inputs keyed by identity, hydrated by the Tier 4 repository. */
export type KpiVaultRaw = {
  source: "live" | "snapshot" | "unavailable";
  activationsByRep: Map<string, number>;
  itemsByRep: Map<string, number>;
  contractsByTeam: Map<string, VaultTeamContracting>;
  ratesByCity: Map<string | null, VaultRate>;
  snapshotsByRep: Map<string, VaultSnapshotFact>;
};

export type KpiDataset = {
  cities: KpiCity[];
  agents: KpiAgent[];
  vault: KpiVaultRaw;
  /** The month the dataset is computed for (`YYYY-MM`). */
  month: string;
};

/* ── Computed facts ────────────────────────────────────────────────────── */

export type KpiVaultFacts = {
  activations: number;
  itemsAdded: number;
  contractsClosed: number;
  /** Average agreed/target margin (%), shared with the rep's team. */
  marginRatio: number;
  salary: number;
  source: "live" | "snapshot" | "unavailable";
  /** Snapshot payroll state; null for live months. */
  status: "pending" | "paid" | null;
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
  facts: KpiVaultFacts;
  metrics: KpiMetric[];
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
