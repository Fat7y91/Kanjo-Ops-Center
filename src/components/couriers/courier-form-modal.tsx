"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { TextField, ToggleField } from "@/components/ui/form-inputs";
import type { Courier } from "@/lib/couriers/types";

import {
  formToPayout,
  payoutToForm,
  PayoutFields,
  type PayoutForm,
} from "./payout-fields";

type CourierFormModalProps = {
  open: boolean;
  /** Null means "create a new partner". */
  courier: Courier | null;
  onClose: () => void;
  onSaved: (courier: Courier, message: string) => void;
};

type FormState = PayoutForm & {
  fullName: string;
  phone: string;
  fixedProfit: string;
  active: boolean;
};

const EMPTY: FormState = {
  ...payoutToForm(null),
  fullName: "",
  phone: "",
  fixedProfit: "",
  active: true,
};

function formFrom(courier: Courier | null): FormState {
  if (!courier) return EMPTY;
  return {
    ...payoutToForm(courier.payoutPreferences),
    fullName: courier.displayName,
    phone: courier.phone,
    fixedProfit: String(courier.fixedProfitPerOrder),
    active: courier.active,
  };
}

export function CourierFormModal({
  open,
  courier,
  onClose,
  onSaved,
}: CourierFormModalProps) {
  const [form, setForm] = useState<FormState>(() => formFrom(courier));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(formFrom(courier));
    setError("");
    setBusy(false);
  }, [open, courier]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function patchPayout(patch: Partial<PayoutForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function submit() {
    setError("");
    setBusy(true);

    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      fixedProfit: Number(form.fixedProfit) || 0,
      payout: formToPayout(form),
      active: form.active,
    };

    try {
      const response = await fetch(
        courier ? `/api/couriers/${courier.id}` : "/api/couriers",
        {
          method: courier ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        courier?: Courier;
      };
      if (!response.ok || !body.courier) {
        setError(body.error ?? "تعذر حفظ بيانات المندوب.");
        return;
      }
      onSaved(
        body.courier,
        courier ? "تم تحديث بيانات المندوب." : "تمت إضافة شريك التوصيل.",
      );
      onClose();
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  const isEdit = courier !== null;

  return (
    <Modal
      open={open}
      eyebrow="المناديب"
      title={isEdit ? "تعديل بيانات المندوب" : "إضافة شريك توصيل"}
      description={
        isEdit
          ? "تعديل بيانات المندوب والربح الثابت وبيانات الصرف."
          : "إضافة مندوب إلى دليل شركاء التوصيل."
      }
      onClose={onClose}
      wide
    >
      <div className="form-grid">
        <TextField
          label="الاسم الكامل"
          required
          value={form.fullName}
          onChange={(event) => set("fullName", event.target.value)}
        />

        <TextField
          label="رقم الهاتف"
          required
          dir="ltr"
          hint="مثل 01012345678 أو +201012345678"
          value={form.phone}
          onChange={(event) => set("phone", event.target.value)}
        />

        <TextField
          label="الربح الثابت لكل طلب"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          dir="ltr"
          value={form.fixedProfit}
          onChange={(event) => set("fixedProfit", event.target.value)}
        />

        <PayoutFields value={form} onChange={patchPayout} />
      </div>

      <div className="courier-form-toggle">
        <ToggleField
          label="المندوب نشط"
          hint="المندوب الموقوف يبقى في السجل لكن لا يُختار في تسجيل العمليات."
          checked={form.active}
          onChange={(checked) => set("active", checked)}
        />
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="courier-modal-actions">
        <Button variant="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "جارٍ الحفظ…" : isEdit ? "حفظ التعديلات" : "إضافة المندوب"}
        </Button>
        <Button variant="quiet" onClick={onClose} disabled={busy}>
          إلغاء
        </Button>
      </div>
    </Modal>
  );
}
