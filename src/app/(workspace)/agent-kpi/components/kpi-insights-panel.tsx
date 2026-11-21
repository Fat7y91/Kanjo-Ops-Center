import type { KpiInsight } from "@/lib/kpi/types";

const TONE_TAG: Record<KpiInsight["tone"], string> = {
  focus: "فرصة تحسين",
  strength: "نقطة قوة",
  neutral: "ملاحظة",
};

/**
 * AI insights panel (Tier 1, dumb).
 *
 * The comparison against the city top performer is computed in Tier 3
 * (`insights.ts`); this component only paints the cards.
 */
export function KpiInsightsPanel({
  insights,
  topName,
}: {
  insights: readonly KpiInsight[];
  topName: string;
}) {
  return (
    <section className="kpi-insight-block" aria-label="تحليل الأداء">
      <div className="kpi-panel-head">
        <div>
          <h2>تحليل ذكي مقابل متصدر المدينة</h2>
          <p>
            توصيات مبنية على فجوة مؤشراتك عن {topName} في نفس المدينة والمرحلة.
            لا تُقارن المؤشرات بين مدن مختلفة.
          </p>
        </div>
      </div>

      <div className="kpi-insights">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className="kpi-insight"
            data-tone={insight.tone}
          >
            <span className="kpi-insight-tag">{TONE_TAG[insight.tone]}</span>
            <strong>{insight.title}</strong>
            <p>{insight.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
