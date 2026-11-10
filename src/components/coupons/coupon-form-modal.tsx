"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { TextField, ToggleField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import type {
  Coupon,
  CouponFunding,
  CouponType,
} from "@/lib/coupons/types";

import {
  COUPON_FUNDING_OPTIONS,
  COUPON_TYPE_OPTIONS,
  couponFormFrom,
  couponPayloadFrom,
  type CouponFormState,
} from "./coupon-form-state";

type CouponFormModalProps = {
  open: boolean;
  /** Null means "create a new coupon". */
  coupon: Coupon | null;
  onClose: () => void;
  onSaved: (coupon: Coupon, message: string) => void;
};

export function CouponFormModal({
  open,
  coupon,
  onClose,
  onSaved,
}: CouponFormModalProps) {
  const [form, setForm] = useState<CouponFormState>(() => couponFormFrom(coupon));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(couponFormFrom(coupon));
    setError("");
    setBusy(false);
  }, [open, coupon]);

  function set<K extends keyof CouponFormState>(
    key: K,
    value: CouponFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const isPercent = form.couponType === "percentage_discount";
  const isFreeShipping = form.couponType === "free_shipping";
  const isCashback = form.couponType === "cashback";

  async function submit() {
    setError("");
    setBusy(true);

    try {
      const response = await fetch(
        coupon ? `/api/coupons/${coupon.id}` : "/api/coupons",
        {
          method: coupon ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(couponPayloadFrom(form)),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        coupon?: Coupon;
      };
      if (!response.ok || !body.coupon) {
        setError(body.error ?? "تعذر حفظ الكوبون.");
        return;
      }
      onSaved(
        body.coupon,
        coupon ? "تم تحديث الكوبون." : "تمت إضافة الكوبون.",
      );
      onClose();
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  const isEdit = coupon !== null;

  return (
    <Modal
      open={open}
      eyebrow="الكوبونات"
      title={isEdit ? "تعديل الكوبون" : "إضافة كوبون"}
      description="قواعد الخصم وتمويله. يُحسب الخصم لكل طلب لحظة التسجيل."
      onClose={onClose}
      wide
    >
      <div className="form-grid">
        <TextField
          label="كود الكوبون"
          required
          dir="ltr"
          hint="يُحوَّل تلقائياً إلى أحرف كبيرة."
          value={form.code}
          onChange={(event) => set("code", event.target.value)}
        />

        <SelectMenu
          label="نوع الكوبون"
          required
          value={form.couponType}
          options={COUPON_TYPE_OPTIONS}
          onChange={(value) => set("couponType", value as CouponType)}
        />

        <SelectMenu
          label="التمويل"
          required
          value={isFreeShipping ? "platform" : form.discountFundedBy}
          options={COUPON_FUNDING_OPTIONS}
          onChange={(value) => set("discountFundedBy", value as CouponFunding)}
          hint={isFreeShipping ? "التوصيل المجاني على كانجو دائماً." : undefined}
          disabled={isFreeShipping}
        />

        <TextField
          label={isPercent ? "نسبة الخصم %" : "قيمة الخصم"}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          dir="ltr"
          hint={isPercent ? "مثال 15 لخصم 15%." : "المبلغ بالجنيه."}
          value={form.discountAmount}
          onChange={(event) => set("discountAmount", event.target.value)}
        />

        <TextField
          label="نسبة تمويل التاجر %"
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="0.01"
          dir="ltr"
          hint="حصة التاجر من الخصم؛ الباقي على كانجو."
          value={form.vendorFundingPercent}
          onChange={(event) =>
            set("vendorFundingPercent", event.target.value)
          }
        />

        {isCashback ? (
          <TextField
            label="مبلغ الاسترداد النقدي"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            dir="ltr"
            hint="يُضاف لرصيد محفظة العميل، لا ينقص نقد التحصيل."
            value={form.cashbackAmount}
            onChange={(event) => set("cashbackAmount", event.target.value)}
          />
        ) : null}

        <TextField
          label="خصم التوصيل"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          dir="ltr"
          hint="اختياري: جزء من الخصم يُطبَّق على رسوم التوصيل."
          value={form.shippingDiscount}
          onChange={(event) => set("shippingDiscount", event.target.value)}
        />

        <TextField
          label="سقف الميزانية"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          dir="ltr"
          hint="اتركه فارغاً بلا سقف."
          value={form.budgetCap}
          onChange={(event) => set("budgetCap", event.target.value)}
        />

        <TextField
          label="أولوية الترتيب"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          dir="ltr"
          value={form.stackPriority}
          onChange={(event) => set("stackPriority", event.target.value)}
        />
      </div>

      <div className="coupon-form-toggle">
        <ToggleField
          label="يمكن تجميع الكوبون"
          hint="الكوبون القابل للتجميع يعمل مع كوبون آخر في نفس الطلب."
          checked={form.stackable}
          onChange={(checked) => set("stackable", checked)}
        />
        <ToggleField
          label="الكوبون نشط"
          checked={form.active}
          onChange={(checked) => set("active", checked)}
        />
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="coupon-modal-actions">
        <Button variant="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "جارٍ الحفظ…" : isEdit ? "حفظ التعديلات" : "إضافة الكوبون"}
        </Button>
        <Button variant="quiet" onClick={onClose} disabled={busy}>
          إلغاء
        </Button>
      </div>
    </Modal>
  );
}
