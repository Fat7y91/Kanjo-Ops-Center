"use client";

import { TargetGauge } from "@/components/bi/target-gauge";
import { Widget } from "@/components/bi/widget";
import { count, percent } from "@/lib/bi/format";
import type { NegotiationRow } from "@/lib/bi/select";
import { BI_DEAL_STAGE_META } from "@/lib/bi/types";

type NegotiationSectionProps = {
  rows: NegotiationRow[];
  merchantsByStage: Record<string, number>;
  onDrill: (id: string) => void;
};

/** Ratio of achieved to target, clamped to a sane ceiling for the bar. */
function ratioOf(row: NegotiationRow): number {
  return row.target === 0 ? 0 : row.achieved / row.target;
}

function toneOf(row: NegotiationRow): "green" | "gold" | "red" | "default" {
  if (row.target === 0) return "default";
  if (row.achieved >= row.target) return "green";
  return row.achieved / row.target >= 0.85 ? "gold" : "red";
}

/**
 * Targets vs actuals.
 *
 * Previously four separate cards; now one widget whose three stage gauges sit
 * side by side behind internal dividers, so the trio reads as a single
 * negotiation scorecard and each gauge keeps its own drill-down.
 */
export function NegotiationSection({
  rows,
  merchantsByStage,
  onDrill,
}: NegotiationSectionProps) {
  const withTarget = rows.filter((row) => row.target > 0);
  const attainment =
    withTarget.length === 0
      ? 0
      : withTarget.reduce((total, row) => total + row.achieved / row.target, 0) /
        withTarget.length;

  return (
    <Widget
      eyebrow="كفاءة التفاوض"
      title="الأهداف مقابل المحقّق"
      span={12}
      badge={
        <span
          className={`badge ${attainment >= 0.98 ? "badge-green" : "badge-gold"}`}
        >
          متوسط التحقيق {percent(attainment, 0)}
        </span>
      }
    >
      <div className="bi-negotiation">
        <div className="bi-negotiation-summary">
          <span className="bi-stat-label">متوسط تحقيق العمولة</span>
          <strong className="bi-negotiation-headline">
            {percent(attainment, 1)}
          </strong>
          <span className="bi-stat-detail">
            {count(withTarget.length)} مرحلة لها هدف محدد
          </span>
          <span className="bi-stat-track" aria-hidden="true">
            <span
              className="bi-stat-fill"
              style={{ width: `${Math.min(attainment, 1) * 100}%` }}
            />
          </span>
        </div>

        <div className="bi-negotiation-stages">
          {rows.map((row) => {
            const meta = BI_DEAL_STAGE_META[row.stage];
            const ratio = ratioOf(row);
            return (
              <div className="bi-negotiation-stage" key={row.stage}>
                <button
                  type="button"
                  className="bi-negotiation-stage-head"
                  onClick={() => onDrill(`negotiation-${row.stage}`)}
                  aria-label={`عرض تفاصيل مرحلة ${meta.label}`}
                >
                  <span className="bi-stat-label">{meta.label}</span>
                  <span className={`bi-chip bi-chip-${toneOf(row)}`}>
                    {row.target === 0 ? "لا هدف" : percent(ratio, 0)}
                  </span>
                </button>

                <TargetGauge target={row.target} achieved={row.achieved} />

                <span className="bi-negotiation-foot">
                  {count(merchantsByStage[row.stage] ?? 0)} تاجر في المرحلة
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Widget>
  );
}
