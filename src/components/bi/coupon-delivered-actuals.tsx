"use client";

import { amount } from "@/lib/bi/format";
import type { DeliveredCouponUsage } from "@/lib/coupons/delivered-usage";
import type { CouponUsageViewRow } from "@/lib/coupons/usage-view";

function egp(value: number): string {
  return `${amount(value)} ج.م.`;
}

/**
 * Delivered-only cash view.
 *
 * The imported report includes cancelled orders, so this mode shows what the
 * operation ledger actually gave up on delivered orders. Per-code rows require
 * `coupon_code` in the order export; until then the KPI totals are still exact.
 */
export function CouponDeliveredActuals({
  delivered,
  reportTotalImpact,
  rows,
}: {
  delivered: DeliveredCouponUsage;
  reportTotalImpact: number;
  rows: readonly CouponUsageViewRow[];
}) {
  const difference = Math.round((reportTotalImpact - delivered.totalImpact) * 100) / 100;

  return (
    <div className="coupon-delivered">
      <div className="coupon-report-stats">
        <div className="bi-stat">
          <span className="bi-stat-label">إجمالي الخصم الفعلي للمسلّم</span>
          <strong className="bi-stat-value">{egp(delivered.totalImpact)}</strong>
          <span className="bi-stat-detail">{delivered.orders} طلب مسلّم</span>
        </div>
        <div className="bi-stat">
          <span className="bi-stat-label">خصم الطلبات</span>
          <strong className="bi-stat-value">{egp(delivered.discountAmount)}</strong>
          <span className="bi-stat-detail">discount_minor</span>
        </div>
        <div className="bi-stat">
          <span className="bi-stat-label">خصم الشحن</span>
          <strong className="bi-stat-value">
            {egp(delivered.shippingDiscount)}
          </strong>
          <span className="bi-stat-detail">shipping_discount_minor</span>
        </div>
        <div className="bi-stat">
          <span className="bi-stat-label">فرق الطلبات الملغاة/غير المسلّمة</span>
          <strong className="bi-stat-value">{egp(difference)}</strong>
          <span className="bi-stat-detail">تقرير كامل − مسلّم</span>
        </div>
      </div>

      {delivered.rewardDiscount > 0 ? (
        <p className="inline-note">
          مكافآت الطلبات المسلّمة: {egp(delivered.rewardDiscount)} ضمن الإجمالي.
        </p>
      ) : null}

      {delivered.hasCouponCodes && rows.length > 0 ? (
        <div className="coupon-report-scroll">
          <table className="coupon-report-table">
            <thead>
              <tr>
                <th scope="col">الكود</th>
                <th scope="col">الاستخدامات المسلّمة</th>
                <th scope="col">خصم الطلب</th>
                <th scope="col">خصم الشحن</th>
                <th scope="col">المكافآت</th>
                <th scope="col">إجمالي الأثر</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <td>
                    <code dir="ltr">{row.code}</code>
                  </td>
                  <td>{row.usesCount}</td>
                  <td>{amount(row.discountAmount)}</td>
                  <td>{amount(row.shippingDiscount)}</td>
                  <td>{amount(row.cashbackAmount)}</td>
                  <td>
                    <strong>{amount(row.totalImpact)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="inline-note coupon-report-note">
          تفصيل الأكواد للطلبات المسلّمة يتفعّل تلقائياً فور توفر عمود
          coupon_code في شيت الطلبات.
        </p>
      )}
    </div>
  );
}
