"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import type { City } from "@/lib/field-ops/types";

type CreateMerchantModalProps = {
  open: boolean;
  cities: City[];
  defaultCityId?: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

type FormState = {
  name: string;
  cityId: string;
  category: string;
  targetCommission: string;
  estimatedMonthlyValue: string;
  strategicNotes: string;
};

function initialForm(cities: City[], defaultCityId?: string): FormState {
  const preferred = cities.find((city) => city.id === defaultCityId);
  const preparation = cities.find((city) => city.stage === "preparation");
  return {
    name: "",
    cityId: preferred?.id ?? preparation?.id ?? cities[0]?.id ?? "",
    category: "",
    targetCommission: "8",
    estimatedMonthlyValue: "100000",
    strategicNotes: "",
  };
}

export function CreateMerchantModal({
  open,
  cities,
  defaultCityId,
  onClose,
  onDone,
}: CreateMerchantModalProps) {
  const [form, setForm] = useState<FormState>(() =>
    initialForm(cities, defaultCityId),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(cities, defaultCityId));
    setError("");
    setSaving(false);
  }, [open, cities, defaultCityId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/field-ops/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          targetCommission: Number(form.targetCommission),
          estimatedMonthlyValue: Number(form.estimatedMonthlyValue),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        merchant?: { name: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر إنشاء التاجر.");
      }
      onDone(
        `تمت إضافة ${payload.merchant?.name ?? form.name} إلى قائمة التجار المستهدفين دون إسناد فريق أو زيارة.`,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر إنشاء التاجر.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="إضافة تاجر مستهدف"
      eyebrow="مرحلة الإعداد"
      description="سجّل التاجر في قائمة الاستهداف. لا يُسند فريق ولا تاريخ زيارة في هذه المرحلة؛ يتم ذلك لاحقاً من مرحلة التعاقدات."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>اسم التاجر</span>
            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="مطعم أو متجر مستهدف"
              required
            />
          </label>
          <label className="field">
            <span>المدينة</span>
            <select
              value={form.cityId}
              onChange={(event) => update("cityId", event.target.value)}
              required
            >
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>التصنيف</span>
            <input
              value={form.category}
              onChange={(event) => update("category", event.target.value)}
              placeholder="مطاعم، صيدليات، بقالة…"
              required
            />
          </label>
          <label className="field">
            <span>العمولة المستهدفة (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={form.targetCommission}
              onChange={(event) =>
                update("targetCommission", event.target.value)
              }
              required
            />
          </label>
          <label className="field">
            <span>القيمة الشهرية التقديرية</span>
            <input
              type="number"
              min={0}
              step="1000"
              value={form.estimatedMonthlyValue}
              onChange={(event) =>
                update("estimatedMonthlyValue", event.target.value)
              }
            />
          </label>
        </div>

        <label className="field">
          <span>ملاحظات استراتيجية</span>
          <textarea
            rows={3}
            value={form.strategicNotes}
            onChange={(event) => update("strategicNotes", event.target.value)}
            placeholder="جهات الاتصال، الموقع، الضغط التنافسي، فرصة التعاقد."
          />
        </label>

        <p className="inline-note">
          يظهر التاجر فوراً في قائمة الاستهداف، ويبقى بدون فريق أو مهمة حتى
          إسناده من مرحلة التعاقدات.
        </p>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving}
          >
            {saving ? "جارٍ الحفظ..." : "إضافة إلى قائمة الاستهداف"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
