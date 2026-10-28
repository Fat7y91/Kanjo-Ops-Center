"use client";

import { ComplianceDonut } from "@/components/bi/compliance-donut";
import { MetricCard } from "@/components/bi/metric-card";
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

  return (
    <section className="bi-section" aria-label="الامتثال">
      <header className="bi-section-head">
        <div>
          <p className="eyebrow">الامتثال</p>
          <h2>حزمة المستندات القانونية</h2>
        </div>
        <span className="badge">
          {count(fullyComplete)} ملف مكتمل بالكامل
        </span>
      </header>

      <div className="bi-grid">
        <MetricCard
          label="اكتمال المستندات"
          value={percent(total === 0 ? 0 : fullyComplete / total, 0)}
          detail="السجل التجاري + البطاقة الضريبية + قائمة المنتجات"
          span="lg"
        >
          <ComplianceDonut
            breakdown={breakdown}
            onSelect={(key) => onDrill(`compliance-${key}`)}
          />
        </MetricCard>

        {breakdown.map((item) => (
          <MetricCard
            key={item.key}
            label={labelFor(item.key)}
            value={percent(item.rate, 0)}
            detail={`${count(item.missing)} ملف ناقص`}
            tone={item.rate >= 0.8 ? "green" : item.rate >= 0.5 ? "gold" : "red"}
            span="xs"
            onOpen={() => onDrill(`compliance-${item.key}`)}
          />
        ))}
      </div>
    </section>
  );
}

function labelFor(key: ComplianceBreakdown["key"]): string {
  switch (key) {
    case "cr":
      return "السجل التجاري";
    case "tax":
      return "البطاقة الضريبية";
    default:
      return "قائمة المنتجات";
  }
}
