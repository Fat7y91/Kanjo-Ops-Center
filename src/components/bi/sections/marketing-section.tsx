"use client";

import { MetricCard } from "@/components/bi/metric-card";
import { compact, count, money, percent } from "@/lib/bi/format";
import { BI_MARKETING_META } from "@/lib/bi/types";
import type { MarketingSummary } from "@/lib/bi/select";

type MarketingSectionProps = {
  marketing: MarketingSummary;
  onDrill: (id: string) => void;
};

export function MarketingSection({ marketing, onDrill }: MarketingSectionProps) {
  return (
    <section className="bi-section" aria-label="التسويق">
      <header className="bi-section-head">
        <div>
          <p className="eyebrow">التسويق</p>
          <h2>الوصول والتحويل</h2>
        </div>
        <span className="badge">
          تكلفة العميل المحتمل {money(marketing.costPerLead)}
        </span>
      </header>

      <div className="bi-grid">
        <MetricCard
          label="إجمالي الوصول"
          value={compact(marketing.reach)}
          detail={`${compact(marketing.impressions)} ظهور`}
          tone="purple"
          span="sm"
          onOpen={() => onDrill("marketing-reach")}
        />
        <MetricCard
          label="عملاء محتملون"
          value={compact(marketing.leads)}
          detail={`${percent(marketing.conversionRate, 1)} تحويل`}
          span="sm"
          onOpen={() => onDrill("marketing-leads")}
        />
        <MetricCard
          label="الإنفاق التسويقي"
          value={money(marketing.spend)}
          detail={`${count(marketing.conversions)} تحويل`}
          tone="gold"
          span="sm"
          onOpen={() => onDrill("marketing-spend")}
        />
        <MetricCard
          label="التحويلات"
          value={compact(marketing.conversions)}
          detail="من عميل محتمل إلى تاجر متعاقد"
          tone="green"
          span="sm"
          onOpen={() => onDrill("marketing-conversions")}
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
    </section>
  );
}
