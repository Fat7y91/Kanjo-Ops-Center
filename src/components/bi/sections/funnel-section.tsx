"use client";

import { FunnelStageChart } from "@/components/bi/funnel-stage-chart";
import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
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
  const provisional =
    steps.find((step) => step.stage === "provisional")?.count ?? 0;
  const conversion = visited === 0 ? 0 : signed / visited;

  return (
    <Widget
      eyebrow="مسار البيع"
      title="دورة حياة التاجر"
      span={12}
      badge={<span className="badge">{count(visited)} زيارة في النطاق</span>}
    >
      <div className="bi-split">
        <div className="bi-split-main">
          <FunnelStageChart
            steps={steps}
            activeStage={activeStage}
            onSelect={(stage) => {
              onStageFocus(stage);
              onDrill(`funnel-${stage}`);
            }}
          />
        </div>

        <div className="bi-split-side">
          <div className="bi-stat-cluster">
            <WidgetStat
              label="معدل التحويل"
              value={percent(conversion, 1)}
              detail="من الزيارة إلى توقيع العقد"
              tone="purple"
              progress={conversion}
            />
            <WidgetDivider />
            <WidgetStat
              label="إجمالي التجار"
              value={count(visited)}
              detail="كل التجار المطابقين للفلاتر"
              onOpen={() => onDrill("merchants-all")}
            />
            <WidgetDivider />
            <WidgetStat
              label="اتفاق مبدئي"
              value={count(provisional)}
              detail={`${percent(visited === 0 ? 0 : provisional / visited, 1)} من الزيارات`}
              tone="gold"
              onOpen={() => onDrill("funnel-provisional")}
            />
            <WidgetDivider />
            <WidgetStat
              label="عقود موقّعة"
              value={count(signed)}
              detail={`${percent(conversion, 1)} من الزيارات`}
              tone="green"
              progress={conversion}
              onOpen={() => onDrill("funnel-signed")}
            />
          </div>
        </div>
      </div>
    </Widget>
  );
}
