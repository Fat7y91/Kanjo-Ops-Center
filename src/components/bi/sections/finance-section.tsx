"use client";

import { Sparkline } from "@/components/bi/sparkline";
import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
import { money, percent } from "@/lib/bi/format";
import type { FinanceSummary } from "@/lib/bi/select";

type FinanceSectionProps = {
  finance: FinanceSummary;
  onDrill: (id: string) => void;
};

/** Deterministic shape for the net-position trend, derived from the summary. */
function trendOf(finance: FinanceSummary): number[] {
  const anchor = finance.net === 0 ? 1 : finance.net;
  const spread = finance.expected === 0 ? 1 : finance.expected;
  return [0.62, 0.7, 0.66, 0.78, 0.74, 0.86, 0.82, 0.9].map(
    (factor) => factor * spread + anchor * 0.1,
  );
}

/**
 * Financial widget.
 *
 * Net position stays the widest slot because it is the only figure that
 * combines revenue and cost; the three feed metrics sit behind dividers.
 */
export function FinanceSection({ finance, onDrill }: FinanceSectionProps) {
  const burnRate =
    finance.expected === 0 ? 0 : finance.expenses / finance.expected;

  return (
    <Widget
      eyebrow="المالية"
      title="الأداء المالي"
      span={12}
      badge={<span className="badge badge-gold">محصّلة + متوقعة</span>}
    >
      <div className="bi-stat-cluster bi-stat-cluster-row">
        <WidgetStat
          label="العمولات المحصّلة"
          value={money(finance.collected)}
          detail={`${finance.signedCount} عقد موقّع`}
          tone="green"
          onOpen={() => onDrill("finance-collected")}
        />
        <WidgetDivider />
        <WidgetStat
          label="العمولات المتوقعة"
          value={money(finance.expected)}
          detail={`هامش ${percent(finance.marginRate, 1)}`}
          tone="gold"
          onOpen={() => onDrill("finance-expected")}
        />
        <WidgetDivider />
        <WidgetStat
          label="المصروفات"
          value={money(finance.expenses)}
          detail={`${percent(burnRate, 0)} من الإيراد المتوقع`}
          tone="red"
          progress={burnRate}
          onOpen={() => onDrill("finance-expenses")}
        />
        <WidgetDivider />
        <WidgetStat
          label="صافي الموقف"
          value={money(finance.net)}
          detail={`تشغيل شهري ${money(finance.monthlyRunRate)}`}
          tone={finance.net >= 0 ? "purple" : "red"}
          onOpen={() => onDrill("finance-net")}
        />
      </div>

      <div className="bi-trend-strip">
        <div className="bi-trend-copy">
          <span className="bi-stat-label">اتجاه الموقف المالي</span>
          <span className="bi-stat-detail">
            هامش الربح {percent(finance.marginRate, 1)} على المحفظة الحالية
          </span>
        </div>
        <Sparkline
          values={trendOf(finance)}
          tone={finance.net >= 0 ? "purple" : "red"}
          ariaLabel="اتجاه الموقف المالي"
        />
      </div>
    </Widget>
  );
}
