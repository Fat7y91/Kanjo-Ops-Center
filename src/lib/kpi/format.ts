import type { KpiMetric } from "@/lib/kpi/types";

/**
 * KPI display formatting (pure, no React).
 *
 * Arabic-first labels with Latin digits to stay consistent with the rest of the
 * workspace tables. Currency is EGP because every seeded city is Egyptian.
 */

const currency = new Intl.NumberFormat("en-EG", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});

export function formatMetricValue(metric: KpiMetric): string {
  switch (metric.unit) {
    case "percent":
      return `${metric.value}%`;
    case "currency":
      return currency.format(metric.value);
    case "minutes":
      return metric.value >= 60
        ? `${Math.round((metric.value / 60) * 10) / 10} س`
        : `${metric.value} د`;
    case "characters":
      return `${metric.value} حرف`;
    default:
      return String(metric.value);
  }
}

export function formatMetricHint(metric: KpiMetric): string {
  const direction =
    metric.direction === "lower" ? "الأقل أفضل" : "الأعلى أفضل";
  return `${metric.hint} · ${direction}`;
}

export function formatScore(score: number): string {
  return `${Math.round(score * 10) / 10}`;
}

export function formatRank(position: number, total: number): string {
  return `المرتبة ${position} من ${total}`;
}

export const KPI_WINDOW_OPTIONS = [
  { value: 7, label: "آخر 7 أيام" },
  { value: 14, label: "آخر 14 يوماً" },
  { value: 30, label: "آخر 30 يوماً" },
  { value: 90, label: "آخر 90 يوماً" },
] as const;

export function windowLabel(days: number): string {
  return (
    KPI_WINDOW_OPTIONS.find((option) => option.value === days)?.label ??
    `آخر ${days} أيام`
  );
}

/**
 * Human labels for the V1 legacy snapshot metrics, in display order.
 *
 * These fields have no dedicated V2 column and never feed the salary formula;
 * they are provenance for an accountant reconciling an imported month. Values
 * may arrive as strings, so the card renders them defensively.
 */
export const LEGACY_METRIC_LABELS: readonly {
  key: string;
  label: string;
}[] = [
  { key: "products", label: "منتجات" },
  { key: "vendors", label: "تجار" },
  { key: "photos", label: "صور" },
  { key: "activeSeconds", label: "وقت العمل النشط" },
  { key: "imageEditSeconds", label: "وقت تعديل الصور" },
];

/** Formats a legacy metric value for display; unknown shapes become text. */
export function formatLegacyValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("en-EG").format(value);
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Splits active seconds into a readable duration. */
export function formatLegacySeconds(value: unknown): string {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours} س ${minutes} د`;
  return `${minutes} د`;
}
