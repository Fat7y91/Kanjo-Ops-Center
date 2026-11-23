"use client";

import { useEffect, useState } from "react";

import { CouponUsageImportModal } from "@/components/bi/coupon-usage-import-modal";
import { useCouponUsageReport } from "@/components/bi/use-coupon-usage-report";
import { Widget } from "@/components/bi/widget";
import { Button } from "@/components/ui/button";
import { ToggleField } from "@/components/ui/form-inputs";
import { amount, count, money } from "@/lib/bi/format";
import {
  COUPON_FUNDING_LABEL,
  COUPON_TYPE_LABEL,
  type CouponFunding,
  type CouponType,
} from "@/lib/coupons/types";

function typeLabel(value: CouponType): string {
  return COUPON_TYPE_LABEL[value] ?? value;
}

function fundingLabel(value: CouponFunding): string {
  return COUPON_FUNDING_LABEL[value] ?? value;
}

function lastUsedLabel(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * Coupon Usage Report card.
 *
 * The imported report counts every order a code was applied to, including
 * cancelled and undelivered orders. It is a marketing snapshot, not the
 * delivered-order P&L, so the note keeps the two totals from being read as a
 * contradiction.
 */
export function CouponUsageReportSection() {
  const report = useCouponUsageReport();
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <Widget
      eyebrow="التسويق"
      title="تقرير الكوبونات"
      span={12}
      badge={
        <span className="badge badge-gold">
          {count(report.totals.activeCodes)} كود مستخدم ·{" "}
          {count(report.totals.totalCodes)} إجمالي
        </span>
      }
    >
      <div className="coupon-report-toolbar">
        <ToggleField
          label="إظهار الكوبونات غير المستخدمة"
          hint={`${count(report.rows.length)} كود في التقرير`}
          checked={report.showUnused}
          onChange={report.setShowUnused}
        />
        <Button
          variant="accent"
          onClick={() => report.setImporting(true)}
          disabled={report.loading}
        >
          استيراد تقرير CSV
        </Button>
      </div>

      <p className="inline-note coupon-report-note">
        يشمل تقرير استخدام الكوبونات كل الطلبات التي طُبّق عليها الكود، بما فيها
        الملغاة وغير المسلّمة. أما أرباح المنصة والتاجر فتُحسب من الطلبات
        المسلّمة فقط.
      </p>

      {report.error ? (
        <p className="form-error" role="alert">
          {report.error}
        </p>
      ) : null}

      {report.loading ? (
        <p className="bi-widget-empty">جارٍ تحميل تقرير الكوبونات…</p>
      ) : report.rows.length === 0 ? (
        <div className="bi-widget-empty">
          <p>لم يُستورد تقرير الكوبونات بعد.</p>
          <Button
            size="sm"
            variant="primary"
            onClick={() => report.setImporting(true)}
          >
            استيراد تقرير CSV
          </Button>
        </div>
      ) : report.visible.length === 0 ? (
        <p className="bi-widget-empty">
          كل الأكواد في التقرير بلا استخدامات. فعّل إظهار غير المستخدم لعرضها.
        </p>
      ) : (
        <>
          <div className="coupon-report-top">
            {report.topCodes.map((row, index) => (
              <div className="coupon-report-top-card" key={row.code}>
                <span className="coupon-report-rank">{index + 1}</span>
                <div>
                  <strong dir="ltr">{row.code}</strong>
                  <span>
                    {count(row.usesCount)} استخدام · {money(row.totalImpact)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="coupon-report-stats">
            <div className="bi-stat">
              <span className="bi-stat-label">إجمالي الأثر</span>
              <strong className="bi-stat-value">
                {money(report.totals.totalImpact)}
              </strong>
              <span className="bi-stat-detail">
                {count(report.totals.uses)} استخدام
              </span>
            </div>
            <div className="bi-stat">
              <span className="bi-stat-label">مدفوع من المنصة</span>
              <strong className="bi-stat-value">
                {money(report.totals.platformFunded)}
              </strong>
              <span className="bi-stat-detail">تمويل كانجو</span>
            </div>
            <div className="bi-stat">
              <span className="bi-stat-label">مدفوع من التاجر</span>
              <strong className="bi-stat-value">
                {money(report.totals.vendorFunded)}
              </strong>
              <span className="bi-stat-detail">حصة التاجر</span>
            </div>
            <div className="bi-stat">
              <span className="bi-stat-label">خصم الشحن والاسترداد</span>
              <strong className="bi-stat-value">
                {money(
                  report.totals.shippingDiscount +
                    report.totals.cashbackAmount,
                )}
              </strong>
              <span className="bi-stat-detail">
                {money(report.totals.shippingDiscount)} شحن ·{" "}
                {money(report.totals.cashbackAmount)} استرداد
              </span>
            </div>
          </div>

          <div className="coupon-report-scroll">
            <table className="coupon-report-table">
              <thead>
                <tr>
                  <th scope="col">الكود</th>
                  <th scope="col">النوع</th>
                  <th scope="col">التمويل</th>
                  <th scope="col">الاستخدامات</th>
                  <th scope="col">خصم الطلب</th>
                  <th scope="col">خصم الشحن</th>
                  <th scope="col">استرداد</th>
                  <th scope="col">إجمالي الأثر</th>
                  <th scope="col">المنصة</th>
                  <th scope="col">التاجر</th>
                  <th scope="col">آخر استخدام</th>
                </tr>
              </thead>
              <tbody>
                {report.visible.map((row) => (
                  <tr key={row.code}>
                    <td>
                      <code dir="ltr">{row.code}</code>
                    </td>
                    <td>{typeLabel(row.couponType)}</td>
                    <td>{fundingLabel(row.discountFundedBy)}</td>
                    <td>{count(row.usesCount)}</td>
                    <td>{amount(row.discountAmount)}</td>
                    <td>{amount(row.shippingDiscount)}</td>
                    <td>{amount(row.cashbackAmount)}</td>
                    <td>
                      <strong>{amount(row.totalImpact)}</strong>
                    </td>
                    <td>{amount(row.platformFunded)}</td>
                    <td>{amount(row.vendorFunded)}</td>
                    <td className="coupon-report-when">
                      {lastUsedLabel(row.lastUsedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <CouponUsageImportModal
        open={report.importing}
        onClose={() => report.setImporting(false)}
        onImported={(message) => {
          setToast(message);
          void report.load();
        }}
      />

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </Widget>
  );
}
