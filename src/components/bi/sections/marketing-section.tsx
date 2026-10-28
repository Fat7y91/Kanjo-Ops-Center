"use client";

import { Sparkline } from "@/components/bi/sparkline";
import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
import { compact, count, money, percent } from "@/lib/bi/format";
import { BI_MARKETING_META } from "@/lib/bi/types";
import type { MarketingSummary } from "@/lib/bi/select";

type MarketingSectionProps = {
  marketing: MarketingSummary;
  onDrill: (id: string) => void;
};

/** Deterministic lead trend shape, anchored to the real lead volume. */
function leadTrend(marketing: MarketingSummary): number[] {
  const base = Math.max(marketing.leads, 1);
  return [0.42, 0.51, 0.47, 0.63, 0.58, 0.72, 0.68, 0.84, 0.9].map(
    (factor) => factor * base,
  );
}

export function MarketingSection({ marketing, onDrill }: MarketingSectionProps) {
  return (
    <Widget
      eyebrow="التسويق"
      title="الوصول والتحويل"
      span={12}
      badge={
        <span className="badge badge-gold">
          تكلفة العميل المحتمل {money(marketing.costPerLead)}
        </span>
      }
    >
      <div className="bi-stat-cluster bi-stat-cluster-row">
        <WidgetStat
          label="إجمالي الوصول"
          value={compact(marketing.reach)}
          detail={`${compact(marketing.impressions)} ظهور`}
          tone="purple"
          onOpen={() => onDrill("marketing-reach")}
        />
        <WidgetDivider />
        <WidgetStat
          label="عملاء محتملون"
          value={compact(marketing.leads)}
          detail={`${percent(marketing.conversionRate, 1)} تحويل`}
          progress={marketing.conversionRate}
          onOpen={() => onDrill("marketing-leads")}
        />
        <WidgetDivider />
        <WidgetStat
          label="الإنفاق التسويقي"
          value={money(marketing.spend)}
          detail={`${count(marketing.conversions)} تحويل`}
          tone="gold"
          onOpen={() => onDrill("marketing-spend")}
        />
        <WidgetDivider />
        <WidgetStat
          label="التحويلات"
          value={compact(marketing.conversions)}
          detail="من عميل محتمل إلى تاجر متعاقد"
          tone="green"
          onOpen={() => onDrill("marketing-conversions")}
        />
      </div>

      <div className="bi-marketing-body">
        <div className="bi-trend-strip bi-trend-strip-flat">
          <div className="bi-trend-copy">
            <span className="bi-stat-label">اتجاه العملاء المحتملين</span>
            <span className="bi-stat-detail">
              معدل التحويل {percent(marketing.conversionRate, 1)}
            </span>
          </div>
          <Sparkline
            values={leadTrend(marketing)}
            tone="green"
            ariaLabel="اتجاه العملاء المحتملين"
          />
        </div>

        <ul className="bi-channel-list">
          {marketing.byChannel.map((channel) => (
            <li key={channel.channel}>
              <button
                type="button"
                className="bi-channel-row"
                onClick={() => onDrill(`marketing-channel-${channel.channel}`)}
                aria-label={`عرض تفاصيل قناة ${BI_MARKETING_META[channel.channel]}`}
              >
                <span className="bi-channel-label">
                  {BI_MARKETING_META[channel.channel]}
                </span>
                <span className="bi-channel-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${
                        marketing.reach === 0
                          ? 0
                          : Math.round((channel.reach / marketing.reach) * 100)
                      }%`,
                    }}
                  />
                </span>
                <strong>{compact(channel.reach)}</strong>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Widget>
  );
}
