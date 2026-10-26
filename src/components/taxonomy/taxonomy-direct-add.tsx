"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { usePermission } from "@/components/auth/use-permission";
import {
  TAXONOMY_KIND_META,
  type TaxonomyKind,
  type TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type TaxonomyDirectAddButtonProps = {
  kind: TaxonomyKind;
  vendorTypes: TaxonomyVendorType[];
  label?: string;
  onCreated: (message: string) => void;
};

export function TaxonomyDirectAddButton({
  kind,
  vendorTypes,
  label = "إضافة مباشرة",
  onCreated,
}: TaxonomyDirectAddButtonProps) {
  const { hasPermission } = usePermission();
  const [open, setOpen] = useState(false);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [dashboardId, setDashboardId] = useState("");
  const [vendorTypeId, setVendorTypeId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameAr("");
    setNameEn("");
    setDashboardId("");
    setVendorTypeId(null);
    setError("");
    setSaving(false);
  }, [open]);

  const selectedVendor = useMemo(
    () => vendorTypes.find((vendor) => vendor.id === vendorTypeId) ?? null,
    [vendorTypes, vendorTypeId],
  );

  if (!hasPermission("manage_taxonomy")) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const numericId = Number(dashboardId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      setError("أدخل معرّف لوحة المستهلك الرقمي الرسمي.");
      return;
    }
    if (kind === "category" && vendorTypeId == null) {
      setError("اختر نوع التاجر الذي يتبع له التصنيف.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/taxonomy/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name_ar: nameAr,
          name_en: nameEn,
          dashboardId: numericId,
          vendorTypeId: kind === "category" ? vendorTypeId : null,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر إنشاء السجل.");
      }
      onCreated(
        `تمت إضافة ${TAXONOMY_KIND_META[kind].label} «${nameAr}» مباشرةً بربط المعرّف ${numericId}.`,
      );
      setOpen(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر إنشاء السجل.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button button-small button-primary taxonomy-direct-add"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      <Modal
        open={open}
        title={`إضافة ${TAXONOMY_KIND_META[kind].label} مباشرة`}
        eyebrow="إدارة التصنيف المركزي"
        description="صلاحية manage_taxonomy تتجاوز طابور الطلبات: أنشئ السجل على لوحة المستهلك ثم أدخل معرّفه الرقمي هنا فوراً."
        onClose={() => {
          if (saving) return;
          setOpen(false);
        }}
        wide
      >
        <form className="form-stack" onSubmit={submit}>
          {kind === "category" ? (
            <label className="field">
              <span>نوع التاجر</span>
              <select
                value={vendorTypeId ?? ""}
                onChange={(event) =>
                  setVendorTypeId(
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                required
                disabled={saving}
              >
                <option value="">اختر نوع التاجر…</option>
                {vendorTypes.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name_ar} (ID: {vendor.id})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="form-grid">
            <label className="field">
              <span>الاسم العربي</span>
              <input
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
                placeholder="مثال: تحاليل منزلية"
                maxLength={120}
                required
                disabled={saving}
                autoFocus
              />
            </label>
            <label className="field">
              <span>الاسم الإنجليزي</span>
              <input
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder="Optional English name"
                maxLength={120}
                disabled={saving}
              />
            </label>
          </div>

          <label className="field">
            <span>Dashboard ID الرسمي</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={dashboardId}
              onChange={(event) => setDashboardId(event.target.value)}
              placeholder="مثال: 16"
              required
              disabled={saving}
            />
            <span className="field-hint">
              المعرّف الذي أنشأته لوحة المستهلك لهذا السجل. لا يُنشأ معرّف محلياً.
            </span>
          </label>

          <div className="inline-note">
            {kind === "category"
              ? selectedVendor
                ? `سيُضاف التصنيف داخل نطاق «${selectedVendor.name_ar}» (ID: ${selectedVendor.id}).`
                : "اختر نوع التاجر قبل الحفظ."
              : "تُنشأ السجلات فوراً دون المرور بطابور الطلبات، لأنك تملك صلاحية الإدارة."}
          </div>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={saving || nameAr.trim().length < 2}
            >
              {saving ? "جارٍ الإنشاء..." : "إضافة مباشرة"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
