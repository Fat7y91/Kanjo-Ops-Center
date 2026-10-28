"use client";

import { PRODUCT_STATE_META, type CatalogProduct } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/catalog/format";
import { Protect } from "@/components/auth/protect";

type ProductCardProps = {
  product: CatalogProduct;
};

export function ProductCard({ product }: ProductCardProps) {
  const meta = PRODUCT_STATE_META[product.state];

  return (
    <article className="product-card">
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
}
