"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import type {
  CatalogProduct,
  CatalogProductState,
} from "@/lib/catalog/types";

type MerchantOption = { id: string; name: string };

type ProductCreateModalProps = {
  open: boolean;
  merchants: MerchantOption[];
  onClose: () => void;
  onCreated: (product: CatalogProduct, revision: number | null) => void;
};

/**
 * Legacy create dialog.
 *
 * Kept as-is during the refactor so the extracted catalog page keeps identical
 * behaviour; the new offline-first entry form replaces it in the feature commit.
 */
export function ProductCreateModal({
  open,
  merchants,
  onClose,
  onCreated,
}: ProductCreateModalProps) {
  const [name, setName] = useState("");
  const [merchantId, setMerchantId] = useState(merchants[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [state, setState] = useState<CatalogProductState>("draft");
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setMerchantId(merchants[0]?.id ?? "");
    setPrice("");
    setState("draft");
    setReviewNote("");
    setError("");
    setSaving(false);
  }, [open, merchants]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/catalog/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          merchantId,
          price: Number(price),
          state,
          reviewNote,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        product?: CatalogProduct;
        revision?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر إنشاء المنتج.");
      }
      if (payload.product) {
        onCreated(
          payload.product,
          typeof payload.revision === "number" ? payload.revision : null,
        );
      }
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر إنشاء المنتج.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="إضافة منتج"
      eyebrow="حوكمة الكتالوج"
      description="أضف منتجاً جديداً وربطه بتاجر قائم. السجل الجديد يُنشأ عبر الخادم بعد التحقق من صلاحية الإنشاء."
      onClose={() => {
        if (saving) return;
        onClose();
      }}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>اسم المنتج</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: زيت زيتون عضوي 1 لتر"
              maxLength={140}
              required
              disabled={saving}
              autoFocus
            />
          </label>
          <label className="field">
            <span>التاجر</span>
            <select
              value={merchantId}
              onChange={(event) => setMerchantId(event.target.value)}
              required
              disabled={saving || merchants.length === 0}
            >
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>السعر (ج.م)</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0"
              required
              disabled={saving}
            />
          </label>
          <label className="field">
            <span>حالة النشر</span>
            <select
              value={state}
              onChange={(event) =>
                setState(event.target.value as CatalogProductState)
              }
              disabled={saving}
            >
              <option value="draft">مسودة</option>
              <option value="published">منشور</option>
            </select>
          </label>
        </div>

        <label className="field">
          <span>ملاحظة المراجعة</span>
          <input
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="مثال: بانتظار اعتماد الصورة"
            maxLength={500}
            disabled={saving}
          />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button
            type="button"
            className="button button-quiet"
            onClick={onClose}
            disabled={saving}
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving || merchants.length === 0}
          >
            {saving ? "جارٍ الحفظ..." : "إضافة المنتج"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
