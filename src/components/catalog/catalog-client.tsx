"use client";

import { useEffect, useState } from "react";

import { Protect } from "@/components/auth/protect";
import { ProductCard } from "@/components/catalog/product-card";
import { ProductCreateModal } from "@/components/catalog/product-create-modal";
import type { CatalogProduct } from "@/lib/catalog/types";

type MerchantOption = { id: string; name: string };

type CatalogClientProps = {
  initialProducts: CatalogProduct[];
  initialRevision: number;
  merchants: MerchantOption[];
};

export function CatalogClient({
  initialProducts,
  initialRevision,
  merchants,
}: CatalogClientProps) {
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts);
  const [revision, setRevision] = useState(initialRevision);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const draftCount = products.filter(
    (product) => product.state === "draft",
  ).length;

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
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}

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

      <ProductCreateModal
        open={open}
        merchants={merchants}
        onClose={() => setOpen(false)}
        onCreated={(product, nextRevision) => {
          setProducts((current) =>
            [...current, product].sort((left, right) =>
              left.name.localeCompare(right.name, "ar"),
            ),
          );
          if (nextRevision !== null) setRevision(nextRevision);
          setToast(`تمت إضافة المنتج «${product.name}» إلى الكتالوج.`);
        }}
      />

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
