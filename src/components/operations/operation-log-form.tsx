"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { ComboField, SelectMenu } from "@/components/ui/select-menus";
import { TextAreaField, TextField } from "@/components/ui/form-inputs";
import { couponTypeLabel } from "@/lib/coupons/format";
import {
  operationDate,
  operationMethodLabel,
  operationMoney,
} from "@/lib/operations/format";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type CourierOption,
  type CouponOption,
  type MerchantOption,
  type OperationSummary,
  type PaymentMethod,
} from "@/lib/operations/types";

import { useOperationForm } from "./use-operation-form";

const METHOD_OPTIONS = PAYMENT_METHODS.map((method) => ({
  value: method,
  label: PAYMENT_METHOD_LABEL[method],
}));

/** Sentinel for the optional coupon picker; a combobox cannot clear itself. */
const NO_COUPON = "none";

export function OperationLogForm({
  couriers,
  merchants,
  coupons,
  initialOperations,
}: {
  couriers: CourierOption[];
  merchants: MerchantOption[];
  coupons: CouponOption[];
  initialOperations: OperationSummary[];
}) {
  const merchantList = Array.isArray(merchants) ? merchants : [];
  const courierList = Array.isArray(couriers) ? couriers : [];
  const couponList = Array.isArray(coupons) ? coupons : [];

  const { form, set, submit, operations, error, notice, busy } =
    useOperationForm(initialOperations);

  const merchantOptions = useMemo(
    () => merchantList.map((m) => ({ value: m.id, label: m.name })),
    [merchantList],
  );
  const courierOptions = useMemo(
    () => courierList.map((c) => ({ value: c.id, label: c.displayName })),
    [courierList],
  );
  const couponOptions = useMemo(
    () => [
      { value: NO_COUPON, label: "بدون كوبون" },
      ...couponList.map((c) => ({
        value: c.id,
        label: c.code,
        hint: couponTypeLabel(c.couponType),
      })),
    ],
    [couponList],
  );

  return (
    <div className="operation-log">
      <article className="panel">
        <div className="panel-head">
          <h2>تسجيل عملية منفذة</h2>
          <span className="muted">
            أدخل بيانات الطلب كما تظهر في نقطة البيع. تُحسب المستحقات آلياً.
          </span>
        </div>

        <div className="form-grid">
          <TextField
            label="رقم الطلب"
            required
            dir="ltr"
            value={form.orderId}
            onChange={(event) => set("orderId", event.target.value)}
            placeholder="ORD-100245"
          />

          <ComboField
            label="التاجر"
            required
            value={form.merchantId || null}
            options={merchantOptions}
            onChange={(value) => set("merchantId", value)}
            placeholder="ابحث عن التاجر"
          />

          <ComboField
            label="المندوب"
            required
            value={form.courierId || null}
            options={courierOptions}
            onChange={(value) => set("courierId", value)}
            placeholder="ابحث عن المندوب"
          />

          <SelectMenu
            label="طريقة الدفع"
            required
            value={form.paymentMethod}
            options={METHOD_OPTIONS}
            onChange={(value) => set("paymentMethod", value as PaymentMethod)}
          />

          <TextField
            label="قيمة الطلب"
            required
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            dir="ltr"
            value={form.orderValue}
            onChange={(event) => set("orderValue", event.target.value)}
          />

          <TextField
            label="رسوم التوصيل"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            dir="ltr"
            value={form.deliveryFee}
            onChange={(event) => set("deliveryFee", event.target.value)}
          />

          <ComboField
            label="الكوبون"
            value={form.couponId || NO_COUPON}
            options={couponOptions}
            onChange={(value) => set("couponId", value === NO_COUPON ? "" : value)}
            placeholder="ابحث عن كود الكوبون"
            hint="اختياري. يُطبَّق الخصم حسب قواعد الكوبون."
          />

          <TextField
            label="خصم المحفظة"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            dir="ltr"
            hint="اختياري. مبلغ يُخصم من رصيد محفظة العميل."
            value={form.walletDiscount}
            onChange={(event) => set("walletDiscount", event.target.value)}
          />

          <TextField
            label="سبب خصم المحفظة"
            value={form.walletDiscountReason}
            onChange={(event) =>
              set("walletDiscountReason", event.target.value)
            }
            hint="يظهر في السجل عند وجود خصم محفظة."
          />

          <TextField
            label="مرجع خصم المحفظة"
            dir="ltr"
            value={form.walletDiscountRef}
            onChange={(event) => set("walletDiscountRef", event.target.value)}
            hint="رقم إذن أو مرجع داخلي اختياري."
          />

          <TextAreaField
            label="ملاحظة"
            rows={2}
            value={form.note}
            onChange={(event) => set("note", event.target.value)}
          />
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="form-notice">{notice}</p> : null}

        <div className="form-actions">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "جارٍ التسجيل…" : "تسجيل العملية"}
          </Button>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h2>آخر العمليات</h2>
          <span className="muted">{operations.length} عملية</span>
        </div>

        {operations.length === 0 ? (
          <p className="muted">لا توجد عمليات مسجلة بعد.</p>
        ) : (
          <ul className="operation-list">
            {operations.map((operation) => (
              <li key={operation.id}>
                <div>
                  <strong>{operation.orderId || "—"}</strong>
                  <span>
                    {operation.merchantName ?? "تاجر"} ·{" "}
                    {operation.courierName ?? "مندوب"}
                  </span>
                  {operation.couponCode ? (
                    <span className="muted" dir="ltr">
                      {operation.couponCode}
                    </span>
                  ) : null}
                </div>
                <div>
                  <span className="badge badge-gold">
                    {operationMethodLabel(operation.paymentMethod)}
                  </span>
                  <span>
                    {operationMoney(operation.orderValue, operation.currency)}
                  </span>
                  <span className="muted">
                    {operationDate(operation.occurredAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}
