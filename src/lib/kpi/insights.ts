import type {
  KpiAgent,
  KpiInsight,
  KpiVaultFacts,
} from "@/lib/kpi/types";

/**
 * Insight heuristics over vault facts (Tier 3, pure).
 *
 * Compares the agent with the city's top performer on the four vault axes and
 * emits at most three actionable cards. Never throws; missing data yields a
 * neutral fallback so the panel is never empty.
 */

type InsightInput = {
  agent: KpiAgent;
  facts: KpiVaultFacts;
  top: { name: string; facts: KpiVaultFacts; score: number } | null;
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
  const { facts, top, rank, rankTotal } = input;
  const topName = top?.name ?? "المتصدر";

  if (!top) {
    return [
      {
        id: "no-baseline",
        tone: "neutral",
        title: "لا يوجد متصدر بعد في مدينتك",
        body: "سجّل تفعيلات أو منتجات جديدة لتصبح أول من يظهر في ترتيب المدينة.",
      },
    ];
  }

  const insights: KpiInsight[] = [];
  const activationGap = gap(
    facts.activations,
    top.facts.activations,
    true,
  );
  const contractGap = gap(
    facts.contractsClosed,
    top.facts.contractsClosed,
    true,
  );
  const itemGap = gap(facts.itemsAdded, top.facts.itemsAdded, true);

  if (activationGap < 0) {
    insights.push({
      id: "vault-activations",
      tone: "focus",
      title: `تفعيلات أقل من ${topName} بنسبة ${fmt(Math.abs(activationGap))}%`,
      body: `فعّلت ${facts.activations} تاجراً مقابل ${top.facts.activations}. ركّز على التجار المحصورين غير المفعّلين في مدينتك.`,
    });
  } else {
    insights.push({
      id: "vault-activations",
      tone: "strength",
      title: "وتيرة تفعيل متقدمة",
      body: `تفعيلاتك ${facts.activations} تعادل أو تتجاوز متصدر المدينة.`,
    });
  }

  if (contractGap < 0) {
    insights.push({
      id: "vault-contracts",
      tone: "focus",
      title: `تعاقدات الفريق أقل بنسبة ${fmt(Math.abs(contractGap))}%`,
      body: `أغلق فريقك ${facts.contractsClosed} تعاقداً مقابل ${top.facts.contractsClosed}. ابدأ من التجار ذوي العمولة المتفق عليها.`,
    });
  } else if (facts.contractsClosed > 0) {
    insights.push({
      id: "vault-contracts",
      tone: "strength",
      title: "إغلاق تعاقدات رائد",
      body: `فريقك أغلق ${facts.contractsClosed} تعاقداً بهذا الشهر. وثّق أفضل الممارسات ليستفيد بقية الفريق.`,
    });
  }

  if (itemGap < 0 && top.facts.itemsAdded > 0) {
    insights.push({
      id: "vault-items",
      tone: "focus",
      title: `إدخال بيانات أقل بنسبة ${fmt(Math.abs(itemGap))}%`,
      body: `أضفت ${facts.itemsAdded} منتجاً مقابل ${top.facts.itemsAdded}. رقمن منتجات التجار المفعّلين أولاً.`,
    });
  }

  insights.push({
    id: "vault-rank",
    tone: rank <= Math.max(1, Math.ceil(rankTotal / 3)) ? "strength" : "neutral",
    title: `ترتيبك ${rank} من ${rankTotal} في مدينتك`,
    body:
      rank <= 1
        ? "أنت متصدر المدينة. حافظ على وتيرة التفعيل والإدخال."
        : `${topName} متصدر بفارق ${fmt(Math.max(0, top.score - input.score))} نقطة. ابدأ بأعلى مؤشر فرق.`,
  });

  return insights.slice(0, 3);
}
