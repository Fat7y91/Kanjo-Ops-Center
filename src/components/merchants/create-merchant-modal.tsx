"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { TaxonomyRequestButton } from "@/components/taxonomy/taxonomy-request-button";
import type { CityStage } from "@/lib/field-ops/types";
import type {
  TaxonomyCategory,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

export type MerchantCityOption = {
  id: string;
  name: string;
  stage: CityStage;
};

export type MerchantTaxonomyOptions = {
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
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
  categoryId: number | null;
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
    categoryId: null,
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

  const categoriesForVendor = useMemo(() => {
    if (form.vendorTypeId == null) return [];
    return taxonomy.categories
      .filter(
        (category) =>
          category.vendorTypeId === form.vendorTypeId && category.active,
      )
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }, [taxonomy.categories, form.vendorTypeId]);

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
    if (form.categoryId == null) {
      setError("اختر تصنيفاً تابعاً لنوع التاجر المحدد.");
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
          categoryId: form.categoryId,
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
      description="نوع التاجر والتصنيف مقيّدان بالتصنيف المركزي المرتبط بمعرّفات لوحة المستهلك. لا يوجد إدخال حر."
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

        <div className="form-grid">
          <div className="field">
            <div className="field-head">
              <span>نوع التاجر</span>
              <span className="taxonomy-id-hint">Dashboard ID</span>
            </div>
            <select
              value={form.vendorTypeId ?? ""}
              onChange={(event) => {
                const next =
                  event.target.value === "" ? null : Number(event.target.value);
                setForm((current) => ({
                  ...current,
                  vendorTypeId: next,
                  categoryId: null,
                }));
              }}
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

          <div className="field">
            <div className="field-head">
              <span>التصنيف</span>
              <span className="taxonomy-id-hint">أمام التصنيف المركزي</span>
            </div>
            <select
              value={form.categoryId ?? ""}
              onChange={(event) =>
                update(
                  "categoryId",
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
              required
              disabled={saving || form.vendorTypeId == null}
            >
              <option value="">
                {form.vendorTypeId == null
                  ? "اختر نوع التاجر أولاً"
                  : categoriesForVendor.length === 0
                    ? "لا توجد تصنيفات معتمدة لهذا النوع"
                    : "اختر التصنيف…"}
              </option>
              {categoriesForVendor.map((category) => (
                <option key={category.key} value={category.id}>
                  {category.name_ar} — ID: {category.id}
                </option>
              ))}
            </select>
            <div className="taxonomy-field-foot">
              <span className="field-hint">
                {form.categoryId != null
                  ? `معرّف التصنيف ${form.categoryId} داخل نطاق النوع ${form.vendorTypeId}`
                  : "التصنيفات تتغير تلقائياً حسب نوع التاجر."}
              </span>
              <TaxonomyRequestButton
                kind="category"
                vendorTypes={activeVendorTypes}
                vendorTypeId={form.vendorTypeId}
                onRequested={setRequestNote}
              />
            </div>
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
              saving ||
              cities.length === 0 ||
              form.vendorTypeId == null ||
              form.categoryId == null
            }
          >
            {saving ? "جارٍ الحفظ..." : "إضافة التاجر"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
