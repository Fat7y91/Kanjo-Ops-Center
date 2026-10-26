"use client";

import { useEffect, useState } from "react";

import { Protect } from "@/components/auth/protect";
import { Modal } from "@/components/field-ops/modal";
import {
  PRODUCT_STATE_META,
  type CatalogProduct,
  type CatalogProductState,
} from "@/lib/catalog/types";

type MerchantOption = { id: string; name: string };

type CatalogClientProps = {
  initialProducts: CatalogProduct[];
  initialRevision: number;
  merchants: MerchantOption[];
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CatalogClient({
  initialProducts,
  initialRevision,
  merchants,
}: CatalogClientProps) {
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts);
  const [revision, setRevision] = useState(initialRevision);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [merchantId, setMerchantId] = useState(merchants[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [state, setState] = useState<CatalogProductState>("draft");
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  const draftCount = products.filter((product) => product.state === "draft").length;

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
        setProducts((current) =>
          [...current, payload.product as CatalogProduct].sort((left, right) =>
            left.name.localeCompare(right.name, "ar"),
          ),
        );
      }
      if (typeof payload.revision === "number") {
        setRevision(payload.revision);
      }
      setToast(`تمت إضافة المنتج «${name}» إلى الكتالوج.`);
      setOpen(false);
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
    <>
      <section className="toolbar-row">
        <span className="badge">{products.length} منتجات</span>
        <span className={draftCount > 0 ? "badge badge-gold" : "badge"}>
          {draftCount} مسودة
        </span>
        <span className="badge">rev {revision}</span>
        <div className="row-actions">
          <Protect
            require={["create_products", "manage_catalog"]}
            mode="any"
            fallback={<span className="badge">عرض فقط</span>}
          >
            <button
              type="button"
              className="button button-primary"
              onClick={() => setOpen(true)}
              disabled={merchants.length === 0}
            >
              إضافة منتج
            </button>
          </Protect>
        </div>
      </section>

      <section className="card-grid">
        {products.map((product) => {
          const meta = PRODUCT_STATE_META[product.state];
          return (
            <article key={product.id} className="product-card">
              <div className="product-thumb" aria-hidden="true">
                <span>{product.name.slice(0, 2)}</span>
              </div>
              <div className="product-body">
                <div className="panel-head compact">
                  <div>
                    <p className="eyebrow">{product.merchantName}</p>
                    <h2>{product.name}</h2>
                  </div>
                  <span className={`badge ${meta.tone}`}>{meta.label}</span>
                </div>
                <div className="product-meta">
                  <strong>{formatPrice(product.price)}</strong>
                  <span>{product.reviewNote}</span>
                </div>
                <div className="row-actions">
                  <Protect require="edit_products">
                    <button
                      type="button"
                      className="button button-small button-quiet"
                      disabled
                      title="تعديل المنتجات يمر عبر مسار المراجعة."
                    >
                      تعديل
                    </button>
                  </Protect>
                  <Protect require="delete_products">
                    <button
                      type="button"
                      className="button button-small button-danger"
                      disabled
                      title="الحذف يمر عبر مسار المراجعة."
                    >
                      حذف
                    </button>
                  </Protect>
                </div>
              </div>
            </article>
          );
        })}

        {products.length === 0 ? (
          <p className="empty-state">لا توجد منتجات في الكتالوج بعد.</p>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">ملاحظة حوكمة</p>
            <h2>ضوابط مدفوعة بالصلاحيات</h2>
          </div>
        </div>
        <p className="panel-note">
          يظهر زر «إضافة منتج» فقط لمن يملك <code>create_products</code> أو{" "}
          <code>manage_catalog</code>، ويتحقق الخادم من نفس القدرات قبل إنشاء
          الطلب. المندوب الميداني لا يرى الزر ولا يستطيع تجاوز الخادم.
        </p>
      </section>

      <Modal
        open={open}
        title="إضافة منتج"
        eyebrow="حوكمة الكتالوج"
        description="أضف منتجاً جديداً وربطه بتاجر قائم. السجل الجديد يُنشأ عبر الخادم بعد التحقق من صلاحية الإنشاء."
        onClose={() => {
          if (saving) return;
          setOpen(false);
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
              onClick={() => setOpen(false)}
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

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
