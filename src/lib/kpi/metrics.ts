import type {
  AgentKpiFacts,
  DataEntryFacts,
  KpiAgent,
  KpiDataset,
  KpiMetric,
  LiveOpsFacts,
  NegotiationFacts,
  PreparationFacts,
  UsageFacts,
} from "@/lib/kpi/types";

/**
 * Pure KPI arithmetic (Tier 3).
 *
 * No React, no persistence, no repository import: every function takes a
 * dataset + agent and returns derived numbers. The service composes these.
 */

const percent = (part: number, whole: number): number =>
  whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10;

const average = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : Math.round(
        values.reduce((total, value) => total + value, 0) / values.length,
      );

const averageFloat = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : Math.round(
        (values.reduce((total, value) => total + value, 0) / values.length) * 10,
      ) / 10;

export function agentCityMerchantIds(dataset: KpiDataset, agent: KpiAgent): Set<string> {
  return new Set(
    dataset.merchants
      .filter((merchant) => merchant.cityId === agent.cityId)
      .map((merchant) => merchant.id),
  );
}

/** Team ownership is the attribution proxy while products lack a `createdBy`. */
export function teamMerchantIds(dataset: KpiDataset, agent: KpiAgent): Set<string> {
  return new Set(
    dataset.merchants
      .filter(
        (merchant) =>
          merchant.cityId === agent.cityId && merchant.team === agent.team,
      )
      .map((merchant) => merchant.id),
  );
}

export function computePreparation(
  dataset: KpiDataset,
  agent: KpiAgent,
): PreparationFacts {
  const entries = dataset.scouts.filter((entry) => entry.agentId === agent.id);
  return {
    merchantsScouted: entries.length,
    avgDescriptionLength: average(entries.map((entry) => entry.description.trim().length)),
  };
}

export function computeNegotiation(
  dataset: KpiDataset,
  agent: KpiAgent,
): NegotiationFacts {
  const reports = dataset.reports.filter((report) => report.repId === agent.id);
  const visited = new Set(reports.map((report) => report.merchantId));
  const cityMerchants = agentCityMerchantIds(dataset, agent);
  const followUps = dataset.followUps.filter(
    (task) => task.createdBy === agent.id,
  );
  const durations = reports
    .map((report) => report.durationSeconds)
    .filter((value): value is number => typeof value === "number" && value > 0);

  const finalDeals = reports.filter(
    (report) => report.outcome === "final_contract" || report.outcome === "signed_contract",
  );
  const provisional = reports.filter((report) => report.outcome === "provisional");

  return {
    merchantsVisited: visited.size,
    totalVisits: reports.length,
    followUps: followUps.length,
    reportsWritten: reports.length,
    avgReportLength: average(reports.map((report) => report.notes.trim().length)),
    targetPercent: percent(visited.size, cityMerchants.size),
    finalContractPercent: percent(
      new Set(finalDeals.map((report) => report.merchantId)).size,
      visited.size,
    ),
    provisionalContractPercent: percent(
      new Set(provisional.map((report) => report.merchantId)).size,
      visited.size,
    ),
    avgVisitDurationMinutes:
      durations.length === 0
        ? 0
        : Math.round((average(durations) / 60) * 10) / 10,
  };
}

export function computeDataEntry(
  dataset: KpiDataset,
  agent: KpiAgent,
): DataEntryFacts {
  const merchantIds = teamMerchantIds(dataset, agent);
  const products = dataset.products.filter((product) =>
    merchantIds.has(product.merchantId),
  );
  const withImage = products.filter((product) => Boolean(product.imageDataUrl));
  const described = products.filter((product) => product.description.trim().length >= 40);

  return {
    merchantsDigitized: new Set(products.map((product) => product.merchantId)).size,
    totalProducts: products.length,
    imagesUploaded: withImage.length,
    productsMissingImages: products.length - withImage.length,
    catalogAccuracy: percent(described.length, products.length),
    avgDescriptionLength: average(
      products.map((product) => product.description.trim().length),
    ),
  };
}

export function computeLiveOps(dataset: KpiDataset, agent: KpiAgent): LiveOpsFacts {
  const days = dataset.liveOps.filter((day) => day.agentId === agent.id);
  const sum = (pick: (day: (typeof days)[number]) => number) =>
    days.reduce((total, day) => total + pick(day), 0);

  return {
    dailyShiftOrders: days.length === 0 ? 0 : Math.round(sum((day) => day.shiftOrders) / days.length),
    totalGmv: sum((day) => day.gmv),
    ticketsResolved: sum((day) => day.ticketsResolved),
    merchantsContacted: sum((day) => day.merchantsContacted),
    rejectedOrders: sum((day) => day.rejectedOrders),
    activeMerchants: days.length === 0 ? 0 : Math.round(sum((day) => day.activeMerchants) / days.length),
    cashCollectedMerchants: sum((day) => day.cashMerchants),
    cashCollectedDrivers: sum((day) => day.cashDrivers),
  };
}

export function computeUsage(dataset: KpiDataset, agent: KpiAgent): UsageFacts {
  const sessions = dataset.usage.filter((session) => session.agentId === agent.id);
  const activeMinutes = sessions.reduce(
    (total, session) => total + session.minutes,
    0,
  );
  return {
    activeMinutes,
    activeDays: new Set(sessions.map((session) => session.date)).size,
    sessions: sessions.length,
    avgSessionMinutes: average(sessions.map((session) => session.minutes)),
  };
}

export function computeFacts(dataset: KpiDataset, agent: KpiAgent): AgentKpiFacts {
  return {
    preparation: computePreparation(dataset, agent),
    negotiation: computeNegotiation(dataset, agent),
    dataEntry: computeDataEntry(dataset, agent),
    liveOps: computeLiveOps(dataset, agent),
    usage: computeUsage(dataset, agent),
  };
}

/* ── Metric presentation ───────────────────────────────────────────────── */

const metric = (
  key: string,
  label: string,
  value: number,
  unit: KpiMetric["unit"],
  hint: string,
  direction: KpiMetric["direction"] = "higher",
): KpiMetric => ({ key, label, value, unit, hint, direction });

export function stageMetrics(facts: AgentKpiFacts, stage: KpiAgent["stage"]): KpiMetric[] {
  if (stage === "preparation") {
    return [
      metric("merchantsScouted", "تجار تم استكشافهم", facts.preparation.merchantsScouted, "count", "عدد التجار المسجلين في قائمة الاستهداف"),
      metric("avgDescriptionLength", "متوسط طول الوصف", facts.preparation.avgDescriptionLength, "characters", "جودة وصف الفرصة التجارية لكل تاجر"),
    ];
  }
  if (stage === "contracting") {
    return [
      metric("merchantsVisited", "تجار تمت زيارتهم", facts.negotiation.merchantsVisited, "count", "التجار الفريدون الذين زارهم المندوب"),
      metric("totalVisits", "إجمالي الزيارات", facts.negotiation.totalVisits, "count", "كل تقارير الزيارة المسجلة"),
      metric("followUps", "متابعات مجدولة", facts.negotiation.followUps, "count", "زيارات/مكالمات/واتساب تم جدولتها"),
      metric("reportsWritten", "تقارير مكتوبة", facts.negotiation.reportsWritten, "count", "تقارير مكتملة قابلة للاعتماد"),
      metric("avgReportLength", "متوسط طول التقرير", facts.negotiation.avgReportLength, "characters", "عمق التوثيق داخل تقرير الزيارة"),
      metric("targetPercent", "نسبة تحقيق المستهدف", facts.negotiation.targetPercent, "percent", "التجار المزارون من إجمالي تجار المدينة"),
      metric("finalContractPercent", "نسبة الاتفاق النهائي", facts.negotiation.finalContractPercent, "percent", "صفقات نهائية من الزيارات الفريدة"),
      metric("provisionalContractPercent", "نسبة الاتفاق المبدئي", facts.negotiation.provisionalContractPercent, "percent", "اتفاقيات مبدئية من الزيارات الفريدة"),
      metric("avgVisitDurationMinutes", "متوسط مدة الزيارة", facts.negotiation.avgVisitDurationMinutes, "minutes", "الزمن الفعلي داخل الزيارة الواحدة"),
    ];
  }
  if (stage === "data_entry") {
    return [
      metric("merchantsDigitized", "تجار تمت رقمنتهم", facts.dataEntry.merchantsDigitized, "count", "تجار أصبح لهم منتجات في الكتالوج"),
      metric("totalProducts", "منتجات مدخلة", facts.dataEntry.totalProducts, "count", "إجمالي المنتجات المسجلة"),
      metric("imagesUploaded", "صور مرفوعة", facts.dataEntry.imagesUploaded, "count", "منتجات لها صورة جاهزة للنشر"),
      metric("productsMissingImages", "منتجات بلا صور", facts.dataEntry.productsMissingImages, "count", "فجوة الصور التي تمنع النشر", "lower"),
      metric("catalogAccuracy", "دقة الكتالوج", facts.dataEntry.catalogAccuracy, "percent", "نسبة المنتجات ذات وصف كافٍ"),
      metric("avgDescriptionLength", "متوسط طول الوصف", facts.dataEntry.avgDescriptionLength, "characters", "جودة وصف المنتج في الكتالوج"),
    ];
  }
  return [
    metric("dailyShiftOrders", "طلبات الشيفت اليومية", facts.liveOps.dailyShiftOrders, "count", "متوسط الطلبات لكل يوم تشغيل"),
    metric("totalGmv", "إجمالي الإيراد (GMV)", facts.liveOps.totalGmv, "currency", "قيمة الطلبات المقبولة"),
    metric("ticketsResolved", "تذاكر تم حلها", facts.liveOps.ticketsResolved, "count", "تذاكر دعم أُغلقت خلال الفترة"),
    metric("merchantsContacted", "تجار تم التواصل معهم", facts.liveOps.merchantsContacted, "count", "مكالمات/زيارات خلال التشغيل"),
    metric("rejectedOrders", "طلبات مرفوضة", facts.liveOps.rejectedOrders, "count", "طلبات أُلغيت بسبب خطأ تشغيلي", "lower"),
    metric("activeMerchants", "تجار نشطون اليوم", facts.liveOps.activeMerchants, "count", "تجار استقبلوا طلبات اليوم"),
    metric("cashCollectedMerchants", "تحصيل نقدي من التجار", facts.liveOps.cashCollectedMerchants, "currency", "الدفعات النقدية المحصلة من التجار"),
    metric("cashCollectedDrivers", "تحصيل نقدي من الطيارين", facts.liveOps.cashCollectedDrivers, "currency", "الكاش المستلم من الطيارين"),
  ];
}

export function usageMetrics(facts: AgentKpiFacts): KpiMetric[] {
  return [
    metric("activeMinutes", "ساعات الاستخدام النشط", facts.usage.activeMinutes, "minutes", "إجمالي الدقائق داخل التطبيق"),
    metric("activeDays", "أيام النشاط", facts.usage.activeDays, "count", "أيام فيها استخدام فعلي"),
    metric("sessions", "عدد الجلسات", facts.usage.sessions, "count", "مرات فتح التطبيق"),
    metric("avgSessionMinutes", "متوسط الجلسة", facts.usage.avgSessionMinutes, "minutes", "طول الجلسة الواحدة"),
  ];
}

/* ── Scoring ───────────────────────────────────────────────────────────── */

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

/** Stage-specific 0-100 score. Weights sum to 100 per stage. */
export function scoreFacts(facts: AgentKpiFacts, stage: KpiAgent["stage"]): number {
  if (stage === "preparation") {
    return clamp(
      clamp(facts.preparation.merchantsScouted * 3, 0, 60) +
        clamp(facts.preparation.avgDescriptionLength * 1.5, 0, 40),
    );
  }
  if (stage === "contracting") {
    return clamp(
      clamp(facts.negotiation.targetPercent, 0, 100) * 0.3 +
        clamp(facts.negotiation.finalContractPercent, 0, 100) * 0.3 +
        clamp(facts.negotiation.provisionalContractPercent, 0, 100) * 0.15 +
        clamp(facts.negotiation.reportsWritten * 4, 0, 100) * 0.15 +
        clamp(facts.negotiation.followUps * 8, 0, 100) * 0.1,
    );
  }
  if (stage === "data_entry") {
    return clamp(
      clamp(facts.dataEntry.merchantsDigitized * 8, 0, 100) * 0.4 +
        clamp(facts.dataEntry.catalogAccuracy, 0, 100) * 0.3 +
        clamp(100 - facts.dataEntry.productsMissingImages * 5, 0, 100) * 0.2 +
        clamp(facts.dataEntry.imagesUploaded * 2, 0, 100) * 0.1,
    );
  }
  return clamp(
    clamp(facts.liveOps.dailyShiftOrders * 2, 0, 100) * 0.25 +
      clamp(facts.liveOps.totalGmv / 5000, 0, 100) * 0.25 +
      clamp(facts.liveOps.ticketsResolved * 5, 0, 100) * 0.15 +
      clamp(facts.liveOps.activeMerchants * 4, 0, 100) * 0.15 +
      clamp(100 - facts.liveOps.rejectedOrders * 5, 0, 100) * 0.1 +
      clamp((facts.liveOps.cashCollectedMerchants + facts.liveOps.cashCollectedDrivers) / 1000, 0, 100) * 0.1,
  );
}
