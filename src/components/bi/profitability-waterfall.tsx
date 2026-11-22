"use client";

import { amount, currencySymbol } from "@/lib/bi/format";
import type { ProfitabilitySummary } from "@/lib/bi/profitability";

type RowTone =
  | "neutral"
  | "deduction"
  | "subtotal"
  | "positive"
  | "negative"
  | "total-positive"
  | "total-negative";

type RowProps = {
  sign: "+" | "-" | "=";
  label: string;
  value: number;
  tone?: RowTone;
  detail?: string;
};

function ProfitabilityRow({
  sign,
  label,
  value,
  tone = "neutral",
  detail,
}: RowProps) {
  return (
    <div className={`profitability-row is-${tone}`}>
      <span className="profitability-sign" aria-hidden="true">
        {sign}
      </span>
      <span className="profitability-label">
        {label}
        {detail ? <span className="profitability-detail">{detail}</span> : null}
      </span>
      <span className="profitability-value" dir="ltr">
        <span className="profitability-amount">{amount(value)}</span>
        <span className="profitability-currency">
          {currencySymbol("EGP")}
        </span>
      </span>
    </div>
  );
}

/**
 * Six-row P&L waterfall shared by the overview and the settlement screen.
 *
 * Rows 3 and 5 carry the operating subtotals; the final row is the net
 * operating result after the fixed courier attendance base.
 */
export function ProfitabilityWaterfall({
  summary,
}: {
  summary: ProfitabilitySummary;
}) {
  if (summary.orders === 0) {
    return <p className="bi-widget-empty">لا توجد طلبات مسلّمة في هذا النطاق.</p>;
  }

  const profitPositive = summary.orderProfitBeforeBase >= 0;
  const netPositive = summary.netOperating >= 0;

  return (
    <div className="profitability-waterfall" dir="rtl">
      <ProfitabilityRow
        sign="+"
        label="إجمالي العمولات المستحقة"
        value={summary.commissions}
        detail="نسبة متفق عليها من قيمة كل طلب مسلّم."
      />
      <ProfitabilityRow
        sign="+"
        label="إجمالي ربحية التوصيل"
        value={summary.deliveryMargin}
        detail="رسوم التوصيل − خصم الشحن − أجر المندوب لكل طلب."
      />
      <ProfitabilityRow
        sign="="
        label="إجمالي الإيراد (العمولات + ربحية التوصيل)"
        value={summary.grossRevenue}
        tone="subtotal"
        detail="مجموع العمولات وربحية التوصيل قبل الخصومات."
      />
      <ProfitabilityRow
        sign="-"
        label="إجمالي الكوبونات والخصومات"
        value={summary.coupons}
        tone="deduction"
        detail="كوبونات ومكافآت تحملتها المنصة."
      />
      <ProfitabilityRow
        sign="="
        label="ربحية الطلبات قبل خصم مصاريف مناديب التوصيل"
        value={summary.orderProfitBeforeBase}
        tone={profitPositive ? "positive" : "negative"}
        detail={`الإيراد − الكوبونات · متوسط للطلب: ${amount(
          summary.averagePerOrder,
        )} ج.م.`}
      />

      <div className="profitability-divider" aria-hidden="true" />

      <ProfitabilityRow
        sign="-"
        label="مصاريف يوميات المناديب الثابتة"
        value={summary.courierDailyBase}
        tone="deduction"
        detail="165 ج.م × عدد أيام عمل المناديب."
      />
      <ProfitabilityRow
        sign="="
        label="صافي ربح/خسارة التشغيل الفعلي"
        value={summary.netOperating}
        tone={netPositive ? "total-positive" : "total-negative"}
        detail="ربحية الطلبات − يوميات المناديب."
      />
    </div>
  );
}
