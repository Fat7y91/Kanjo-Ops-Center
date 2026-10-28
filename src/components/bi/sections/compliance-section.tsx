"use client";

import { ComplianceDonut } from "@/components/bi/compliance-donut";
import { Widget, WidgetStat } from "@/components/bi/widget";
import { count, percent } from "@/lib/bi/format";
import type { ComplianceBreakdown } from "@/lib/bi/select";

type ComplianceSectionProps = {
  breakdown: ComplianceBreakdown[];
  onDrill: (id: string) => void;
};

export function ComplianceSection({
  breakdown,
  onDrill,
}: ComplianceSectionProps) {
  const total = breakdown[0]?.total ?? 0;
  const fullyComplete = breakdown.reduce(
    (minimum, item) => Math.min(minimum, item.complete),
    total,
  );
  const rate = total === 0 ? 0 : fullyComplete / total;

  return (
    <Widget
      eyebrow="الامتثال"
      title="حزمة المستندات القانونية"
      span={6}
      badge={<span className="badge">{count(fullyComplete)} ملف مكتمل</span>}
    >
      <div className="bi-split bi-split-tight">
        <div className="bi-split-main">
          <ComplianceDonut
            breakdown={breakdown}
            onSelect={(key) => onDrill(`compliance-${key}`)}
          />
        </div>
        <div className="bi-split-side">
          <WidgetStat
            label="اكتمال المستندات"
            value={percent(rate, 0)}
            detail="السجل التجاري + البطاقة الضريبية + قائمة المنتجات"
            tone={rate >= 0.8 ? "green" : rate >= 0.5 ? "gold" : "red"}
            progress={rate}
          />
        </div>
      </div>
    </Widget>
  );
}
