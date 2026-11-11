"use client";

import { TextAreaField, TextField } from "@/components/ui/form-inputs";
import {
  ComboField,
  SelectMenu,
  type SelectOption,
} from "@/components/ui/select-menus";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from "@/lib/operations/types";

import type { FormState } from "./use-operation-form";

const METHOD_OPTIONS = PAYMENT_METHODS.map((method) => ({
  value: method,
  label: PAYMENT_METHOD_LABEL[method],
}));

/** Sentinel for the optional coupon picker; a combobox cannot clear itself. */
export const NO_COUPON = "none";

type FormField = <K extends keyof FormState>(key: K, value: FormState[K]) => void;

/**
 * The blind-entry fields.
 *
 * Kept in its own component so the logger container stays a layout shell: this
 * is the only place that knows the visible field set, and it accepts nothing
 * beyond what the employee can observe at the counter.
 */
export function OperationLogFields({
  form,
  set,
  merchantOptions,
  courierOptions,
  couponOptions,
}: {
  form: FormState;
  set: FormField;
  merchantOptions: SelectOption<string>[];
  courierOptions: SelectOption<string>[];
  couponOptions: SelectOption<string>[];
}) {
  return (
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
        placeholder="ابحث أو اختر التاجر"
      />

      <ComboField
        label="مندوب التوصيل"
        required
        value={form.courierId || null}
        options={courierOptions}
        onChange={(value) => set("courierId", value)}
        placeholder="ابحث أو اختر مندوب التوصيل"
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
        placeholder="ابحث أو اختر الكوبون"
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
        onChange={(event) => set("walletDiscountReason", event.target.value)}
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
  );
}
