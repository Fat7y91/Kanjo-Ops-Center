"use client";

import { useCallback, useEffect, useState } from "react";

import { Protect } from "@/components/auth/protect";
import { CatalogGrid } from "@/components/catalog/catalog-grid";
import { ProductEntry } from "@/components/catalog/product-entry";
import type { CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import type { CatalogProduct } from "@/lib/catalog/types";
import type {
  TaxonomyCategory,
  TaxonomyVariant,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type CatalogClientProps = {
  initialProducts: CatalogProduct[];
  initialRevision: number;
  merchants: CatalogMerchantOption[];
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
};

export function CatalogClient({
  initialProducts,
  initialRevision,
  merchants,
  vendorTypes,
  categories,
  variants,
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

  const reviewCount = products.filter(
    (product) => product.state === "pending_review",
  ).length;

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/catalog/products", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        products?: CatalogProduct[];
        revision?: number;
      };
      if (payload.products) setProducts(payload.products);
      if (typeof payload.revision === "number") setRevision(payload.revision);
    } catch {
      // Offline: the draft queue banner already communicates local state.
    }
  }, []);

  const handleSynced = useCallback(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <section className="toolbar-row">
        <span className="badge">{products.length} منتجات</span>
        <span className={reviewCount > 0 ? "badge badge-gold" : "badge"}>
          {reviewCount} بانتظار مراجعة الصورة
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

      <ProductEntry
        open={open}
        merchants={merchants}
        vendorTypes={vendorTypes}
        categories={categories}
        variants={variants}
        onClose={() => setOpen(false)}
        onSynced={handleSynced}
      />

      <CatalogGrid
        products={products}
        categories={categories}
        variants={variants}
        onProductsChange={setProducts}
      />

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
          الطلب. التصنيفات والمتغيرات تُقرأ من التصنيف المركزي فقط، ولا يمكن
          تجاوزها من الواجهة.
        </p>
      </section>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
