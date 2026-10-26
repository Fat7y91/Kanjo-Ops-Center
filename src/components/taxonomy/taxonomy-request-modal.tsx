"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import {
  TAXONOMY_KIND_META,
  type TaxonomyKind,
  type TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type TaxonomyRequestModalProps = {
  open: boolean;
  kind: TaxonomyKind;
  vendorTypes: TaxonomyVendorType[];
  defaultVendorTypeId?: number | null;
  suggestedName?: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function TaxonomyRequestModal({
  open,
  kind,
  vendorTypes,
  defaultVendorTypeId,
  suggestedName,
  onClose,
  onDone,
}: TaxonomyRequestModalProps) {
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [justification, setJustification] = useState("");
  const [vendorTypeId, setVendorTypeId] = useState<number | null>(
    defaultVendorTypeId ?? null,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameAr(suggestedName ?? "");
    setNameEn("");
    setJustification("");
    setVendorTypeId(defaultVendorTypeId ?? null);
    setError("");
    setSaving(false);
  }, [open, suggestedName, defaultVendorTypeId]);

  const selectedVendor = useMemo(
    () => vendorTypes.find((vendor) => vendor.id === vendorTypeId) ?? null,
    [vendorTypes, vendorTypeId],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (kind === "category" && vendorTypeId == null) {
      setError("اختر نوع التاجر الذي يتبع له التصنيف المقترح.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/taxonomy/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name_ar: nameAr,
          name_en: nameEn,
          justification,
          vendorTypeId: kind === "category" ? vendorTypeId : null,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر إرسال الطلب.");
      }
      onDone(
        `تم إرسال طلب إضافة ${TAXONOMY_KIND_META[kind].label} «${nameAr}» إلى قائمة المراجعة.`,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "تعذر إرسال الطلب.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`طلب إضافة ${TAXONOMY_KIND_META[kind].label}`}
      eyebrow="حوكمة التصنيف المركزي"
      description="لا يمكن إنشاء تصنيف مباشرة. يُرسل الطلب إلى مسؤول التصنيفات، ولن يُعتمد إلا بعد إدخال معرّف لوحة المستهلك الرسمي."
      onClose={onClose}
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
            <span>الاسم العربي المقترح</span>
            <input
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              placeholder="مثال: تحاليل منزلية"
              maxLength={120}
              required
              disabled={saving}
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
          <span>مبرر الإضافة</span>
          <textarea
            rows={4}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            placeholder="لماذا لا يكفي التصنيف الحالي؟ ما حجم الطلب في السوق؟"
            maxLength={2000}
            required
            disabled={saving}
          />
          <span className="field-hint">
            10 أحرف على الأقل. يُرفق هذا المبرر مع الطلب في قائمة المراجعة.
          </span>
        </label>

        <div className="inline-note">
          {selectedVendor
            ? `سيُطلب من المسؤول ربط التصنيف بنوع «${selectedVendor.name_ar}» بعد إنشائه على لوحة المستهلك.`
            : "يُربط السجل الجديد بمعرّف لوحة المستهلك الرقمي عند الاعتماد، ولا يُنشأ أي معرّف محلياً."}
        </div>

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
            {saving ? "جارٍ الإرسال..." : "إرسال الطلب"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
