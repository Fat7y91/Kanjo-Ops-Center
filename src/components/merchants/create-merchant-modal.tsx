"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { TaxonomyRequestButton } from "@/components/taxonomy/taxonomy-request-button";
import type { CityStage } from "@/lib/field-ops/types";
import type { TaxonomyVendorType } from "@/lib/taxonomy/types";

export type MerchantCityOption = {
  id: string;
  name: string;
  stage: CityStage;
};

export type MerchantTaxonomyOptions = {
  vendorTypes: TaxonomyVendorType[];
};

type CreateMerchantModalProps = {
  open: boolean;
  cities: MerchantCityOption[];
  taxonomy: MerchantTaxonomyOptions;
  defaultCityId?: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

type FormState = {
  name: string;
  cityId: string;
  vendorTypeId: number | null;
  strategicNotes: string;
};

function initialForm(
  cities: MerchantCityOption[],
  defaultCityId?: string,
): FormState {
  const preferred = cities.find((city) => city.id === defaultCityId);
  const preparation = cities.find((city) => city.stage === "preparation");
  return {
    name: "",
    cityId: preferred?.id ?? preparation?.id ?? cities[0]?.id ?? "",
    vendorTypeId: null,
    strategicNotes: "",
  };
}

export function CreateMerchantModal({
  open,
  cities,
  taxonomy,
  defaultCityId,
  onClose,
  onDone,
}: CreateMerchantModalProps) {
  const [form, setForm] = useState<FormState>(() =>
    initialForm(cities, defaultCityId),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestNote, setRequestNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(cities, defaultCityId));
    setError("");
    setSaving(false);
    setRequestNote("");
  }, [open, cities, defaultCityId]);

  const activeVendorTypes = useMemo(
    () => taxonomy.vendorTypes.filter((vendor) => vendor.active),
    [taxonomy.vendorTypes],
  );

  const vendorType = activeVendorTypes.find(
    (vendor) => vendor.id === form.vendorTypeId,
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.vendorTypeId == null) {
      setError("اختر نوع التاجر من التصنيف المركزي.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/field-ops/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          cityId: form.cityId,
          vendorTypeId: form.vendorTypeId,
          strategicNotes: form.strategicNotes,
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
        `تمت إضافة ${payload.merchant?.name ?? form.name} إلى دليل التجار دون فريق أو تاريخ زيارة.`,
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
      title="إضافة تاجر"
      eyebrow="دليل التجار"
      description="نوع التاجر مقيّد بالتصنيف المركزي المرتبط بمعرّفات لوحة المستهلك. لا يوجد إدخال حر، والتصنيفات الفرعية تخص وحدة الكتالوج لا ملف التاجر."
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
              placeholder="مطعم أو متجر أو صيدلية"
              maxLength={120}
              required
            />
          </label>
          <label className="field">
            <span>المدينة</span>
            <select
              value={form.cityId}
              onChange={(event) => update("cityId", event.target.value)}
              required
              disabled={cities.length === 0}
            >
              {cities.length === 0 ? (
                <option value="">لا توجد مدن داخل نطاقك</option>
              ) : (
                cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))
              )}
            </select>
            <span className="field-hint">
              مقيّدة بالمدن المتاحة لنطاقك الحالي.
            </span>
          </label>
        </div>

        <div className="field">
          <div className="field-head">
            <span>نوع التاجر</span>
            <span className="taxonomy-id-hint">Dashboard ID</span>
          </div>
          <select
            value={form.vendorTypeId ?? ""}
            onChange={(event) =>
              update(
                "vendorTypeId",
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
            required
            disabled={saving}
          >
            <option value="">اختر نوع التاجر…</option>
            {activeVendorTypes.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name_ar} — ID: {vendor.id}
              </option>
            ))}
          </select>
          <div className="taxonomy-field-foot">
            <span className="field-hint">
              {vendorType
                ? `${vendorType.name_en || vendorType.name_ar} · معرّف لوحة المستهلك ${vendorType.id}`
                : "القائمة مقفلة على التصنيف المعتمد."}
            </span>
            <TaxonomyRequestButton
              kind="vendor_type"
              vendorTypes={activeVendorTypes}
              suggestedName={form.name}
              onRequested={setRequestNote}
            />
          </div>
        </div>

        {requestNote ? (
          <p className="inline-note" role="status">
            {requestNote}
          </p>
        ) : null}

        <label className="field">
          <span>ملاحظات استراتيجية</span>
          <textarea
            rows={3}
            value={form.strategicNotes}
            onChange={(event) => update("strategicNotes", event.target.value)}
            placeholder="جهات الاتصال، الموقع، الضغط التنافسي، فرصة التعاقد."
            maxLength={2000}
          />
        </label>

        <p className="inline-note">
          يظهر التاجر فوراً في دليل التجار وفي قائمة إسناد المهام، ويبقى بدون
          فريق أو تاريخ زيارة حتى يُسند من العمليات الميدانية.
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
            disabled={
              saving || cities.length === 0 || form.vendorTypeId == null
            }
          >
            {saving ? "جارٍ الحفظ..." : "إضافة التاجر"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
