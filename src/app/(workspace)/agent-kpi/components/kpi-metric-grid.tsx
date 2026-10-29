import { formatMetricHint, formatMetricValue } from "@/lib/kpi/format";
import type { KpiMetric } from "@/lib/kpi/types";

/**
 * Metric grid (Tier 1, dumb).
 *
 * Renders whatever metrics the service produced for the agent's city stage.
 * Stage switching is a domain concern, not a UI one.
 */
export function KpiMetricGrid({ metrics }: { metrics: readonly KpiMetric[] }) {
  return (
    <div className="kpi-metric-grid">
      {metrics.map((metric) => (
        <article
          key={metric.key}
          className="kpi-metric"
          data-direction={metric.direction}
        >
          <span className="kpi-metric-label">{metric.label}</span>
          <strong className="kpi-metric-value">
            {formatMetricValue(metric)}
          </strong>
          <span className="kpi-metric-hint">{formatMetricHint(metric)}</span>
        </article>
      ))}
    </div>
  );
}
