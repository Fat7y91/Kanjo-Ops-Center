"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import type { OrderBreakdown } from "@/lib/operations/breakdown";
import {
  operationMethodLabel,
} from "@/lib/operations/format";

type BreakdownModalProps = {
  open: boolean;
  loading: boolean;
  error: string;
  breakdown: OrderBreakdown | null;
  onClose: () => void;
  onRetry: () => void;
};

function Row({
  label,
  value,
  tone = "",
  hint,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "total" | "";
  hint?: string;
}) {
  return (
    <div className={`breakdown-row${tone ? ` breakdown-row-${tone}` : ""}`}>
      <span className="breakdown-row-label">
        {label}
        {hint ? <em className="breakdown-row-hint">{hint}</em> : null}
      </span>
      <strong dir="ltr">{value}</strong>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="breakdown-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/**
 * Management invoice for one order.
 *
 * The figures are read from the operation row's frozen money terms and the
 * posted journal is shown underneath as the audit trail, so a reviewer can
 * reconcile the invoice with the book without leaving the page.
 */
export function BreakdownModal({
  open,
  loading,
  error,
  breakdown,
  onClose,
  onRetry,
}: BreakdownModalProps) {
  const currency = breakdown?.operation.currency ?? "EGP";
  const money = (value: number) => currencyMoney(value, currency);

  return (
    <Modal
      open={open}
      title="تفاصيل أرباح الطلب"
      eyebrow="اقتصاديات الوحدة"
      onClose={onClose}
      wide
    >
      {loading ? <p className="muted">جارٍ تحميل التفاصيل…</p> : null}

      {!loading && error ? (
        <div className="breakdown-error" role="alert">
          <p className="form-error">{error}</p>
          <div className="form-actions">
            <Button variant="primary" size="sm" onClick={onRetry}>
              إعادة المحاولة
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && !error && breakdown ? (
        <div className="breakdown" dir="rtl">
          <header className="breakdown-head">
            <div>
              <span className="badge badge-gold">
                {operationMethodLabel(breakdown.operation.paymentMethod)}
              </span>
              <h4 dir="ltr">{breakdown.operation.orderId}</h4>
              <p className="muted">
                {breakdown.operation.merchantName} ·{" "}
                {breakdown.operation.courierName} ·{" "}
                {shortDate(breakdown.operation.occurredAt)}
              </p>
            </div>
            <div className="breakdown-head-total">
              <span>يدفع العميل</span>
              <strong dir="ltr">{money(breakdown.customerPays)}</strong>
            </div>
          </header>

          <Section title="توزيع قيمة الطلب">
            <Row
              label="قيمة الطلب"
              value={money(breakdown.orderValue)}
              hint="سعر المنتجات"
            />
            <Row label="رسوم التوصيل" value={money(breakdown.deliveryFee)} />
            {breakdown.coupon ? (
              <Row
                label="خصم الكوبون"
                value={`− ${money(breakdown.coupon.discount)}`}
                hint={breakdown.coupon.code}
                tone="negative"
              />
            ) : null}
            {breakdown.walletDiscount > 0 ? (
              <Row
                label="خصم المحفظة"
                value={`− ${money(breakdown.walletDiscount)}`}
                tone="negative"
              />
            ) : null}
            <Row
              label="الإجمالي المحصّل من العميل"
              value={money(breakdown.customerPays)}
              tone="total"
            />
          </Section>

          <Section title="مستحقات الأطراف">
            <Row
              label="مستحقات التاجر"
              value={money(breakdown.merchantDues)}
              hint={
                breakdown.coupon && breakdown.coupon.vendorFunded > 0
                  ? `بعد تحمّل التاجر ${money(breakdown.coupon.vendorFunded)} من الكوبون`
                  : undefined
              }
            />
            <Row
              label="مستحقات مندوب التوصيل"
              value={money(breakdown.courierDues)}
              hint="ربح ثابت لكل طلب"
            />
            {breakdown.platform.cashbackExpense > 0 ? (
              <Row
                label="كاش باك للعميل"
                value={money(breakdown.platform.cashbackExpense)}
                hint="يُضاف لمحفظة العميل"
              />
            ) : null}
          </Section>

          <Section title="ربح المنصة">
            <Row
              label="إيراد العمولة"
              value={`+ ${money(breakdown.platform.commissionRevenue)}`}
              tone="positive"
            />
            <Row
              label="إيراد التوصيل"
              value={`+ ${money(breakdown.platform.deliveryRevenue)}`}
              tone="positive"
            />
            {breakdown.platform.couponExpense > 0 ? (
              <Row
                label="مصروف الكوبون (على المنصة)"
                value={`− ${money(breakdown.platform.couponExpense)}`}
                tone="negative"
              />
            ) : null}
            {breakdown.platform.walletExpense > 0 ? (
              <Row
                label="مصروف خصم المحفظة"
                value={`− ${money(breakdown.platform.walletExpense)}`}
                tone="negative"
              />
            ) : null}
            <Row
              label="مصروف ربح مندوب التوصيل"
              value={`− ${money(breakdown.platform.courierExpense)}`}
              tone="negative"
            />
            <Row
              label="صافي ربح المنصة"
              value={money(breakdown.platform.net)}
              tone="total"
            />
          </Section>

          <Section title="القيود المحاسبية">
            {breakdown.journal.lines.length === 0 ? (
              <p className="muted">
                لم يُرحّل قيد لهذه العملية بعد.
              </p>
            ) : (
              <>
                <table className="breakdown-journal">
                  <thead>
                    <tr>
                      <th>الحساب</th>
                      <th>مدين</th>
                      <th>دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.journal.lines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <span dir="ltr">{line.code}</span>{" "}
                          {line.name}
                          {line.memo ? (
                            <em className="breakdown-journal-memo">
                              {line.memo}
                            </em>
                          ) : null}
                        </td>
                        <td dir="ltr">
                          {line.debit > 0 ? money(line.debit) : "—"}
                        </td>
                        <td dir="ltr">
                          {line.credit > 0 ? money(line.credit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>الإجمالي</td>
                      <td dir="ltr">{money(breakdown.journal.debitTotal)}</td>
                      <td dir="ltr">{money(breakdown.journal.creditTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
                <p
                  className={
                    breakdown.journal.balanced
                      ? "breakdown-balanced"
                      : "form-error"
                  }
                >
                  {breakdown.journal.balanced
                    ? "القيد متوازن."
                    : "القيد غير متوازن — راجع الدفتر."}
                </p>
              </>
            )}
          </Section>

          {breakdown.operation.note ? (
            <p className="muted">ملاحظة: {breakdown.operation.note}</p>
          ) : null}

          <div className="breakdown-foot">
            <Button size="sm" variant="quiet" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
