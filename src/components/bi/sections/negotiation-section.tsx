"use client";

import { MetricCard } from "@/components/bi/metric-card";
import { TargetGauge } from "@/components/bi/target-gauge";
import { count, percent } from "@/lib/bi/format";
import type { NegotiationRow } from "@/lib/bi/select";
import { BI_DEAL_STAGE_META } from "@/lib/bi/types";

type NegotiationSectionProps = {
  rows: NegotiationRow[];
  merchantsByStage: Record<string, number>;
  onDrill: (id: string) => void;
};

/**
 * Targets vs actuals.
 *
 * Each negotiated stage gets its own gauge tile so the trio fills the grid
 * exactly and every gauge is an independent drill-down target.
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
    <section className="bi-section" aria-label="كفاءة التفاوض">
      <header className="bi-section-head">
        <div>
          <p className="eyebrow">كفاءة التفاوض</p>
          <h2>الأهداف مقابل المحقّق</h2>
        </div>
        <span className="badge badge-gold">
          متوسط التحقيق {percent(attainment, 0)}
        </span>
      </header>

      <div className="bi-grid">
        <MetricCard
          label="متوسط تحقيق العمولة"
          value={percent(attainment, 1)}
          detail="مرجّح على مراحل الاتفاق المبدئي والنهائي والتوقيع"
          tone={attainment >= 0.98 ? "green" : "gold"}
          span="sm"
          footer={
            <span className="bi-card-foot">
              {count(withTarget.length)} مرحلة لها هدف محدد
            </span>
          }
        />

        {rows.map((row) => {
          const meta = BI_DEAL_STAGE_META[row.stage];
          return (
            <MetricCard
              key={row.stage}
              label={`${meta.label} — هدف ${row.target.toFixed(1)}%`}
              value={percent(row.target === 0 ? 0 : row.achieved / row.target, 0)}
              detail={`${count(merchantsByStage[row.stage] ?? 0)} تاجر في المرحلة`}
              tone={
                row.target === 0
                  ? "default"
                  : row.achieved >= row.target
                    ? "green"
                    : "red"
              }
              span="sm"
              onOpen={() => onDrill(`negotiation-${row.stage}`)}
            >
              <TargetGauge target={row.target} achieved={row.achieved} />
            </MetricCard>
          );
        })}
      </div>
    </section>
  );
}
