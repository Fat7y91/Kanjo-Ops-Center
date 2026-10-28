"use client";

import { MetricCard } from "@/components/bi/metric-card";
import { FunnelStageChart } from "@/components/bi/funnel-stage-chart";
import { count, percent } from "@/lib/bi/format";
import type { FunnelStep } from "@/lib/bi/select";
import type { BiDealStage } from "@/lib/bi/types";

type FunnelSectionProps = {
  steps: FunnelStep[];
  onDrill: (id: string) => void;
  activeStage: BiDealStage | null;
  onStageFocus: (stage: BiDealStage | null) => void;
};

export function FunnelSection({
  steps,
  onDrill,
  activeStage,
  onStageFocus,
}: FunnelSectionProps) {
  const visited = steps.find((step) => step.stage === "visited")?.count ?? 0;
  const signed = steps.find((step) => step.stage === "signed")?.count ?? 0;
  const conversion = visited === 0 ? 0 : signed / visited;

  return (
    <section className="bi-section" aria-label="مسار التجار">
      <header className="bi-section-head">
        <div>
          <p className="eyebrow">مسار البيع</p>
          <h2>دورة حياة التاجر</h2>
        </div>
        <span className="badge">{count(visited)} زيارة في النطاق</span>
      </header>

      <div className="bi-grid">
        <MetricCard
          label="قمع التحويل"
          value={percent(conversion, 1)}
          detail="من الزيارة إلى توقيع العقد"
          tone="purple"
          span="lg"
        >
          <FunnelStageChart
            steps={steps}
            activeStage={activeStage}
            onSelect={(stage) => {
              onStageFocus(stage);
              onDrill(`funnel-${stage}`);
            }}
          />
        </MetricCard>

        <MetricCard
          label="إجمالي التجار"
          value={count(visited)}
          detail="كل التجار المطابقين للفلاتر"
          span="sm"
          onOpen={() => onDrill("merchants-all")}
        />
        <MetricCard
          label="عقود موقّعة"
          value={count(signed)}
          detail={`${percent(conversion, 1)} من الزيارات`}
          tone="green"
          span="sm"
          onOpen={() => onDrill("funnel-signed")}
        />
      </div>
    </section>
  );
}
