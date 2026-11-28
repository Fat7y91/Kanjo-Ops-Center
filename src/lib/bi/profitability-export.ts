import type { ProfitabilitySummary } from "@/lib/bi/profitability";

/** Rows of the standalone P&L workbook, shared with the settlement export. */
export function profitabilityRows(
  summary: ProfitabilitySummary,
): Record<string, string | number>[] {
  return [
    { البند: "إجمالي العمولات المستحقة", القيمة: summary.commissions },
    { البند: "إجمالي ربحية التوصيل", القيمة: summary.deliveryMargin },
    {
      البند: "إجمالي الإيراد (العمولات + ربحية التوصيل)",
      القيمة: summary.grossRevenue,
    },
    { البند: "إجمالي الكوبونات والخصومات", القيمة: summary.coupons },
    {
      البند: "ربحية الطلبات قبل خصم مصاريف مناديب التوصيل",
      القيمة: summary.orderProfitBeforeBase,
    },
    {
      البند: "- مصاريف يوميات المناديب الثابتة",
      القيمة: summary.courierDailyBase,
    },
    {
      البند: "= صافي ربح/خسارة التشغيل الفعلي",
      القيمة: summary.netOperating,
    },
  ];
}
