"use client";

import { useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import {
  TAXONOMY_KIND_META,
  type TaxonomyRequest,
  type TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type TaxonomyMarkAddedModalProps = {
  request: TaxonomyRequest | null;
  vendorTypes: TaxonomyVendorType[];
  onClose: () => void;
  onDone: (message: string) => void;
};

/**
 * Marks a pending request as added after the central sync.
 *
 * The operator must first upload the central dashboard sheet so the record
 * exists with its official Dashboard ID; this dialog only links that existing
 * record back to the request. The server rejects the link when the entity is
 * absent, so a request can never be closed before the sheet actually landed.
 */
export function TaxonomyMarkAddedModal({
  request,
  vendorTypes,
  onClose,
  onDone,
}: TaxonomyMarkAddedModalProps) {
  const [dashboardId, setDashboardId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const vendorName =
    request?.vendorTypeId != null
      ? vendorTypes.find((vendor) => vendor.id === request.vendorTypeId)
          ?.name_ar
      : null;

  async function submit() {
    if (!request) return;
    const numericId = Number(dashboardId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      setError("أدخل معرّف لوحة المستهلك الرقمي الرسمي.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch(
        `/api/taxonomy/requests/${request.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dashboardId: numericId }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر تأكيد الإضافة.");
      }
      onDone(
        `تم تأكيد إضافة «${request.name_ar}» بربط المعرّف ${numericId}.`,
      );
      setDashboardId("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "تعذر تأكيد الإضافة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={request != null}
      title="تأكيد الإضافة"
      eyebrow="بعد مزامنة لوحة التحكم"
      description="ارفع ملف لوحة التحكم أولاً حتى يُنشأ السجل رسمياً، ثم أكّد إضافته هنا بربط معرّفه."
      onClose={() => {
        if (saving) return;
        onClose();
      }}
    >
      {request ? (
        <div className="form-stack">
          <div className="taxonomy-approve-summary">
            <span className="badge">
              {TAXONOMY_KIND_META[request.kind].label}
            </span>
            <h3>{request.name_ar}</h3>
            {request.kind === "category" && vendorName ? (
              <p className="muted">يتبع نوع: {vendorName}</p>
            ) : null}
            <p className="taxonomy-justification">{request.justification}</p>
          </div>
          <TextField
            label="Dashboard ID الرسمي"
            type="number"
            inputMode="numeric"
            min={1}
            value={dashboardId}
            onChange={(event) => setDashboardId(event.target.value)}
            placeholder="مثال: 16"
            hint="المعرّف الذي ورد في ملف المزامنة. يجب أن يكون السجل موجوداً فعلاً في التصنيف المركزي قبل التأكيد."
            required
            autoFocus
          />
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="form-actions">
            <Button variant="quiet" onClick={onClose} disabled={saving}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={saving || dashboardId.trim().length === 0}
            >
              {saving ? "جارٍ التأكيد..." : "تم الإضافة"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
