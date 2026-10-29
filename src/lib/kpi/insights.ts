import type {
  AgentKpiFacts,
  KpiAgent,
  KpiInsight,
  KpiStage,
} from "@/lib/kpi/types";

/**
 * Insight heuristics (Tier 3, pure).
 *
 * Compares the viewer against the city's top performer for the same stage and
 * emits at most three actionable cards. Never throws; missing data yields a
 * neutral fallback so the panel is never empty.
 */

type InsightInput = {
  agent: KpiAgent;
  stage: KpiStage;
  facts: AgentKpiFacts;
  top: { name: string; facts: AgentKpiFacts; score: number } | null;
  score: number;
  rank: number;
  rankTotal: number;
};

const fmt = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

function gap(current: number, best: number, higherIsBetter: boolean): number {
  if (best <= 0 && current <= 0) return 0;
  const reference = Math.max(best, current, 1);
  const raw = ((current - best) / reference) * 100;
  return Math.round((higherIsBetter ? raw : -raw) * 10) / 10;
}

export function buildInsights(input: InsightInput): KpiInsight[] {
  const { stage, facts, top, rank, rankTotal } = input;
  const topName = top?.name ?? "المتصدر";
  const insights: KpiInsight[] = [];

  if (!top) {
    return [
      {
        id: "no-baseline",
        tone: "neutral",
        title: "لا يوجد متصدر بعد في مدينتك",
        body: "سجّل زيارات أو بيانات إضافية لتصبح أول من يظهر في ترتيب المدينة.",
      },
    ];
  }

  if (stage === "preparation") {
    const scoutedGap = gap(facts.preparation.merchantsScouted, top.facts.preparation.merchantsScouted, true);
    const descGap = gap(facts.preparation.avgDescriptionLength, top.facts.preparation.avgDescriptionLength, true);
    insights.push({
      id: "prep-scout",
      tone: scoutedGap < 0 ? "focus" : "strength",
      title:
        scoutedGap < 0
          ? `أضف ${fmt(Math.max(0, top.facts.preparation.merchantsScouted - facts.preparation.merchantsScouted))} تاجراً للوصول إلى ${topName}`
          : "تغطية استكشاف أعلى من المتصدر",
      body:
        scoutedGap < 0
          ? `استكشافك أقل بنسبة ${fmt(Math.abs(scoutedGap))}% من متصدر المدينة. ركّز على شوارع لم تُحصر بعد.`
          : "استمر في الحفاظ على معدل الحصر الحالي قبل بدء مرحلة التعاقدات.",
    });
    insights.push({
      id: "prep-desc",
      tone: descGap < 0 ? "focus" : "strength",
      title: descGap < 0 ? "وصف الفرصة التجارية يحتاج تفصيلاً" : "جودة وصف ممتازة",
      body:
        descGap < 0
          ? `متوسط وصفك ${fmt(facts.preparation.avgDescriptionLength)} حرفاً مقابل ${fmt(top.facts.preparation.avgDescriptionLength)} لدى ${topName}. أضف حجم السوق والمنافسين المتوقعين.`
          : "وصفك يمنح الفريق سياقاً كافياً لبدء التفاوض دون إعادة زيارة.",
    });
    return insights;
  }

  if (stage === "contracting") {
    const targetGap = gap(facts.negotiation.targetPercent, top.facts.negotiation.targetPercent, true);
    const finalGap = gap(facts.negotiation.finalContractPercent, top.facts.negotiation.finalContractPercent, true);
    insights.push({
      id: "neg-target",
      tone: targetGap < 0 ? "focus" : "strength",
      title:
        targetGap < 0
          ? `زياراتك تغطي ${fmt(facts.negotiation.targetPercent)}% من تجار المدينة`
          : "تغطية مستهدفة متقدمة",
      body:
        targetGap < 0
          ? `${topName} يغطي ${fmt(top.facts.negotiation.targetPercent)}%. خصّص يومين لمتابعة التجار غير المزارين.`
          : "حافظ على وتيرة الزيارات وأضف متابعات مبرمجة للتجار المبدئيين.",
    });
    insights.push({
      id: "neg-final",
      tone: finalGap < 0 ? "focus" : "strength",
      title:
        finalGap < 0
          ? "حوّل الاتفاقيات المبدئية إلى نهائية"
          : "أعلى نسبة إغلاق نهائي في المدينة",
      body:
        finalGap < 0
          ? `نسبتك ${fmt(facts.negotiation.finalContractPercent)}% مقابل ${fmt(top.facts.negotiation.finalContractPercent)}%. ابدأ من التجار ذوي العمولة المتفق عليها.`
          : "استمر في إغلاق الصفقات بسرعة قبل انتهاء صلاحية الفترة التجريبية.",
    });
    if (
      facts.negotiation.avgVisitDurationMinutes > 0 &&
      facts.negotiation.avgReportLength < top.facts.negotiation.avgReportLength
    ) {
      insights.push({
        id: "neg-report",
        tone: "focus",
        title: "تقاريرك أقصر من المتصدر",
        body: `متوسط ${fmt(facts.negotiation.avgReportLength)} حرفاً مقابل ${fmt(top.facts.negotiation.avgReportLength)}. وثّق الاعتراضات والأسعار البديلة.`,
      });
    }
    return insights.slice(0, 3);
  }

  if (stage === "data_entry") {
    const coverGap = gap(facts.dataEntry.merchantsDigitized, top.facts.dataEntry.merchantsDigitized, true);
    insights.push({
      id: "data-digitized",
      tone: coverGap < 0 ? "focus" : "strength",
      title:
        coverGap < 0
          ? `رقمنة ${fmt(facts.dataEntry.merchantsDigitized)} تاجراً فقط`
          : "تغطية رقمنة رائدة",
      body:
        coverGap < 0
          ? `${topName} رقمن ${fmt(top.facts.dataEntry.merchantsDigitized)} تاجراً. ابدأ بالتجار ذوي العقود النهائية.`
          : "وسّع الرقمنة إلى المنتجات المتغيرة لإكمال دقة الكتالوج.",
    });
    insights.push({
      id: "data-images",
      tone: facts.dataEntry.productsMissingImages > 0 ? "focus" : "strength",
      title:
        facts.dataEntry.productsMissingImages > 0
          ? `${facts.dataEntry.productsMissingImages} منتجاً بلا صورة`
          : "كل منتجاتك لها صور",
      body:
        facts.dataEntry.productsMissingImages > 0
          ? "الصور شرط للنشر. التقط الصور أثناء الزيارة التالية وارفعها مباشرة."
          : `دقتك ${fmt(facts.dataEntry.catalogAccuracy)}%. راجع الأوصاف القصيرة لرفعها للمتصدر.`,
    });
    return insights;
  }

  const orderGap = gap(facts.liveOps.dailyShiftOrders, top.facts.liveOps.dailyShiftOrders, true);
  const rejectGap = gap(facts.liveOps.rejectedOrders, top.facts.liveOps.rejectedOrders, false);
  insights.push({
    id: "live-orders",
    tone: orderGap < 0 ? "focus" : "strength",
    title:
      orderGap < 0
        ? `طلبات الشيفت أقل بنسبة ${fmt(Math.abs(orderGap))}% من المتصدر`
        : "أعلى معدل طلبات يومية",
    body:
      orderGap < 0
        ? `${topName} يحقق ${fmt(top.facts.liveOps.dailyShiftOrders)} طلباً يومياً مقابل ${fmt(facts.liveOps.dailyShiftOrders)}. فعّل التجار ذوي الطلب المرتفع قبل الذروة.`
        : "حافظ على التغطية اليومية وتابع التذاكر المفتوحة قبل نهاية الشيفت.",
  });
  insights.push({
    id: "live-reject",
    tone: facts.liveOps.rejectedOrders > top.facts.liveOps.rejectedOrders ? "focus" : "strength",
    title:
      facts.liveOps.rejectedOrders > 0
        ? `${facts.liveOps.rejectedOrders} طلباً مرفوضاً`
        : "لا طلبات مرفوضة",
    body:
      facts.liveOps.rejectedOrders > 0
        ? "راجع أسباب الرفض مع التجار: نقص مخزون أو سعر أو وقت تجهيز طويل. الرفض يأكل هامش GMV."
        : "استمر في متابعة جاهزية التجار لتقليل الرفض الصفري.",
  });
  insights.push({
    id: "live-rank",
    tone: rank <= Math.max(1, Math.ceil(rankTotal / 3)) ? "strength" : "neutral",
    title: `ترتيبك ${rank} من ${rankTotal} في مدينتك`,
    body:
      rank <= 1
        ? "أنت متصدر المدينة. وثّق أفضل ممارساتك ليستفيد فريقك."
        : `${topName} متصدر بفارق ${fmt(Math.max(0, top.score - input.score))} نقطة. ابدأ بأعلى مؤشر فرق.`,
  });
  return insights;
}
