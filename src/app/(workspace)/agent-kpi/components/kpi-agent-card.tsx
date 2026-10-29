import { KpiInsightsPanel } from "@/app/(workspace)/agent-kpi/components/kpi-insights-panel";
import { KpiMetricGrid } from "@/app/(workspace)/agent-kpi/components/kpi-metric-grid";
import { KpiRankCard } from "@/app/(workspace)/agent-kpi/components/kpi-rank-card";
import { formatMetricValue } from "@/lib/kpi/format";
import { KPI_STAGE_META, type KpiSnapshot } from "@/lib/kpi/types";

const ALL_STAGES = ["preparation", "contracting", "data_entry", "live_operations"] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");
}

/**
 * Single agent KPI card (Tier 1, dumb).
 *
 * Lays out stage metrics, usage strip, city rank and AI insights. All values
 * arrive pre-computed on the `snapshot`.
 */
export function KpiAgentCard({ snapshot }: { snapshot: KpiSnapshot }) {
  const stage = KPI_STAGE_META[snapshot.stage];

  return (
    <article className="kpi-panel kpi-agent-card">
      <div className="kpi-agent-head">
        <div className="kpi-agent-identity">
          <span className="kpi-agent-avatar" aria-hidden="true">
            {initials(snapshot.agent.name)}
          </span>
          <div>
            <strong>{snapshot.agent.name}</strong>
            <span>
              {snapshot.agent.team} · {snapshot.agent.cityName}
            </span>
          </div>
        </div>
        <span className="badge badge-purple">
          {stage.code} · {snapshot.stageLabel}
        </span>
      </div>

      <div className="kpi-stage-rail" aria-label="مراحل دورة حياة المدينة">
        {ALL_STAGES.map((key) => (
          <span
            key={key}
            className="kpi-stage-pill"
            data-active={key === snapshot.stage}
          >
            <code>{KPI_STAGE_META[key].code}</code>
            {KPI_STAGE_META[key].label}
          </span>
        ))}
      </div>

      <KpiMetricGrid metrics={snapshot.metrics} />

      <div className="kpi-usage">
        {snapshot.usageMetrics.map((metric) => (
          <div key={metric.key} className="kpi-usage-item">
            <span>{metric.label}</span>
            <strong>{formatMetricValue(metric)}</strong>
          </div>
        ))}
      </div>

      <div className="kpi-split">
        <div className="kpi-insight-block">
          <KpiInsightsPanel
            insights={snapshot.insights}
            topName={
              snapshot.topPerformer.isSelf
                ? "المتصدر الحالي"
                : snapshot.topPerformer.name
            }
          />
        </div>
        <KpiRankCard snapshot={snapshot} />
      </div>
    </article>
  );
}
