"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import {
  TextField,
  ToggleField,
} from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  AVAILABILITIES,
  AVAILABILITY_LABEL,
  type Availability,
  type Courier,
} from "@/lib/couriers/types";

type CourierFormModalProps = {
  open: boolean;
  /** Null means "create a new partner". */
  courier: Courier | null;
  onClose: () => void;
  onSaved: (courier: Courier, message: string) => void;
};

type FormState = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  cutPercent: string;
  vehicleType: string;
  vehiclePlate: string;
  availability: Availability;
  active: boolean;
};

const EMPTY: FormState = {
  fullName: "",
  phone: "",
  email: "",
  password: "",
  cutPercent: "",
  vehicleType: "",
  vehiclePlate: "",
  availability: "available",
  active: true,
};

const AVAILABILITY_OPTIONS = AVAILABILITIES.map((value) => ({
  value,
  label: AVAILABILITY_LABEL[value],
}));

function formFrom(courier: Courier | null): FormState {
  if (!courier) return EMPTY;
  return {
    fullName: courier.displayName,
    phone: courier.phone,
    email: courier.email,
    password: "",
    cutPercent: String(courier.cutPercent),
    vehicleType: courier.vehicleType,
    vehiclePlate: courier.vehiclePlate,
    availability: courier.availability,
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

  async function submit() {
    setError("");
    setBusy(true);

    const payload = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      password: form.password,
      cutPercent: Number(form.cutPercent) || 0,
      vehicleType: form.vehicleType.trim(),
      vehiclePlate: form.vehiclePlate.trim(),
      availability: form.availability,
      active: form.active,
      ...(courier ? {} : { phone: form.phone.trim() }),
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
          ? "تعديل بيانات المركبة والتوفر ونسبة الربح."
          : "إنشاء حساب دخول للمندوب وربطه بدليل شركاء التوصيل."
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
          required={!isEdit}
          dir="ltr"
          disabled={isEdit}
          hint={isEdit ? "رقم الدخول لا يُعدّل من هنا." : "بصيغة E.164 مثل +201012345678"}
          value={form.phone}
          onChange={(event) => set("phone", event.target.value)}
        />

        <TextField
          label="البريد الإلكتروني"
          type="email"
          dir="ltr"
          value={form.email}
          onChange={(event) => set("email", event.target.value)}
        />

        <TextField
          label={isEdit ? "كلمة مرور جديدة" : "كلمة المرور"}
          required={!isEdit}
          type="password"
          dir="ltr"
          hint={isEdit ? "اتركها فارغة للإبقاء على كلمة المرور الحالية." : undefined}
          value={form.password}
          onChange={(event) => set("password", event.target.value)}
        />

        <TextField
          label="نسبة الربح %"
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="0.01"
          dir="ltr"
          value={form.cutPercent}
          onChange={(event) => set("cutPercent", event.target.value)}
        />

        <SelectMenu
          label="التوفر"
          value={form.availability}
          options={AVAILABILITY_OPTIONS}
          onChange={(value) => set("availability", value as Availability)}
        />

        <TextField
          label="المركبة"
          placeholder="دراجة نارية، سيارة، فان…"
          value={form.vehicleType}
          onChange={(event) => set("vehicleType", event.target.value)}
        />

        <TextField
          label="اللوحة"
          dir="ltr"
          value={form.vehiclePlate}
          onChange={(event) => set("vehiclePlate", event.target.value)}
        />
      </div>

      <div className="courier-form-toggle">
        <ToggleField
          label="الحساب نشط"
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
