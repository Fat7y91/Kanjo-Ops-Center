"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import type { MerchantCityOption } from "@/components/merchants/create-merchant-modal";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import type { Merchant } from "@/lib/field-ops/types";
import type { TaxonomyVendorType } from "@/lib/taxonomy/types";

type EditMerchantModalProps = {
  open: boolean;
  merchant: Merchant;
  cities: MerchantCityOption[];
  vendorTypes: TaxonomyVendorType[];
  onClose: () => void;
  onDone: (message: string) => void;
};

type FormState = {
  name: string;
  phone: string;
  address: string;
  vendorTypeId: number | null;
  cityId: string;
  targetCommission: string;
  strategicNotes: string;
};

function initialForm(merchant: Merchant): FormState {
  return {
    name: merchant.name,
    phone: merchant.phone ?? "",
    address: merchant.address ?? "",
    vendorTypeId: merchant.vendorTypeId || null,
    cityId: merchant.cityId,
    targetCommission: String(merchant.targetCommission),
    strategicNotes: merchant.strategicNotes,
  };
}

/**
 * Manual correction of a merchant's core details.
 *
 * Only reachable when the session holds `edit_merchants`. Contract state is
 * deliberately absent: it transitions through the audited state workflow so the
 * append-only override trail stays complete.
 */
export function EditMerchantModal({
  open,
  merchant,
  cities,
  vendorTypes,
  onClose,
  onDone,
}: EditMerchantModalProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(merchant));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(merchant));
    setError("");
    setSaving(false);
  }, [open, merchant]);

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
      const response = await fetch(`/api/merchants/${merchant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          address: form.address,
          vendorTypeId: form.vendorTypeId,
          cityId: form.cityId,
          targetCommission: form.targetCommission,
          strategicNotes: form.strategicNotes,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        merchant?: { name: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر حفظ بيانات التاجر.");
      }
      onDone(`تم تحديث بيانات ${payload.merchant?.name ?? form.name}.`);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر حفظ بيانات التاجر.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="تعديل بيانات التاجر"
      eyebrow={merchant.name}
      description="صحّح اسم التاجر وبيانات التواصل والتصنيف والمدينة ونسبة العمولة. الحالة التعاقدية تُدار من مسار الحالة المعتمد."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <TextField
            label="اسم التاجر"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="مطعم أو متجر أو صيدلية"
            maxLength={120}
            required
          />
          <TextField
            label="رقم الهاتف"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
            placeholder="01xxxxxxxxx"
            maxLength={30}
            dir="ltr"
          />
        </div>

        <TextField
          label="العنوان"
          value={form.address}
          onChange={(event) => update("address", event.target.value)}
          placeholder="العنوان الفعلي للمحل"
          maxLength={240}
        />

        <div className="form-grid">
          <SelectMenu<number>
            label="نوع التاجر"
            value={form.vendorTypeId}
            onChange={(value) => update("vendorTypeId", value)}
            options={vendorTypes
              .filter((vendor) => vendor.active)
              .map((vendor) => ({
                value: vendor.id,
                label: vendor.name_ar,
              }))}
            required
          />
          <SelectMenu<string>
            label="المدينة"
            value={form.cityId}
            onChange={(value) => update("cityId", value)}
            options={cities.map((city) => ({
              value: city.id,
              label: city.name,
            }))}
            disabled={cities.length === 0}
            required
          />
          <TextField
            label="نسبة العمولة"
            hint="0٪ مسموح بها."
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.01"
            value={form.targetCommission}
            onChange={(event) => update("targetCommission", event.target.value)}
            dir="ltr"
            required
          />
        </div>

        <TextAreaField
          label="ملاحظات استراتيجية"
          value={form.strategicNotes}
          onChange={(event) => update("strategicNotes", event.target.value)}
          maxLength={2000}
          rows={3}
        />

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="row-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "جاري الحفظ…" : "حفظ التعديلات"}
          </Button>
          <Button
            type="button"
            variant="quiet"
            onClick={onClose}
            disabled={saving}
          >
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}
