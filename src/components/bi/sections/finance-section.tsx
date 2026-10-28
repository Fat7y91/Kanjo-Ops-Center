"use client";

import { MetricCard } from "@/components/bi/metric-card";
import { money, percent } from "@/lib/bi/format";
import type { FinanceSummary } from "@/lib/bi/select";

type FinanceSectionProps = {
  finance: FinanceSummary;
  onDrill: (id: string) => void;
};

/**
 * Financial bento group.
 *
 * Net profit is deliberately the widest tile: it is the only number that
 * combines revenue and cost, so it deserves the visual anchor.
 */
export function FinanceSection({ finance, onDrill }: FinanceSectionProps) {
  const burnRate =
    finance.expected === 0 ? 0 : finance.expenses / finance.expected;

  return (
    <section className="bi-section" aria-label="المالية">
      <header className="bi-section-head">
        <div>
          <p className="eyebrow">المالية</p>
          <h2>الأداء المالي</h2>
        </div>
        <span className="badge badge-gold">محصّلة + متوقعة</span>
      </header>

      <div className="bi-grid">
        <MetricCard
          label="العمولات المحصّلة"
          value={money(finance.collected)}
          detail={`${finance.signedCount} عقد موقّع`}
          tone="green"
          span="sm"
          onOpen={() => onDrill("finance-collected")}
        />
        <MetricCard
          label="العمولات المتوقعة"
          value={money(finance.expected)}
          detail={`معدل هامش ${percent(finance.marginRate, 1)}`}
          tone="gold"
          span="sm"
          onOpen={() => onDrill("finance-expected")}
        />
        <MetricCard
          label="المصروفات"
          value={money(finance.expenses)}
          detail={`${percent(burnRate, 0)} من الإيراد المتوقع`}
          tone="red"
          span="sm"
          onOpen={() => onDrill("finance-expenses")}
        />
        <MetricCard
          label="صافي الموقف"
          value={money(finance.net)}
          detail={`تشغيل شهري ${money(finance.monthlyRunRate)}`}
          tone={finance.net >= 0 ? "purple" : "red"}
          span="sm"
          onOpen={() => onDrill("finance-net")}
        />
      </div>
    </section>
  );
}
