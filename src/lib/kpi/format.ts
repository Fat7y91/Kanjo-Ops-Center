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
