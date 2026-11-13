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

function stageCount(steps: FunnelStep[], stage: BiDealStage): number {
  return steps.find((step) => step.stage === stage)?.count ?? 0;
}

export function FunnelSection({
  steps,
  onDrill,
  activeStage,
  onStageFocus,
}: FunnelSectionProps) {
  const visited = stageCount(steps, "visited");
  const signed = stageCount(steps, "signed");
  const provisional = stageCount(steps, "provisional");
  const noContract = stageCount(steps, "no_contract");
  const share = (value: number) => (visited === 0 ? 0 : value / visited);
  const conversion = share(signed);

  return (
    <Widget
      eyebrow="مسار التعاقدات مع التجار"
      title="دورة حياة التاجر"
      span={4}
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
              detail="نسبة العقود الموقّعة من إجمالي الزيارات"
              tone="purple"
              progress={conversion}
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
            <WidgetDivider />
            <WidgetStat
              label="اتفاق مبدئي"
              value={count(provisional)}
              detail={`${percent(share(provisional), 1)} من الزيارات`}
              tone="gold"
              onOpen={() => onDrill("funnel-provisional")}
            />
            <WidgetDivider />
            <WidgetStat
              label="بدون اتفاق"
              value={count(noContract)}
              detail={`${percent(share(noContract), 1)} من الزيارات`}
              tone="red"
              onOpen={() => onDrill("funnel-no_contract")}
            />
            <WidgetDivider />
            <WidgetStat
              label="إجمالي التجار"
              value={count(visited)}
              detail="كل التجار المطابقين للفلاتر"
              onOpen={() => onDrill("merchants-all")}
            />
          </div>
        </div>
      </div>
    </Widget>
  );
}
