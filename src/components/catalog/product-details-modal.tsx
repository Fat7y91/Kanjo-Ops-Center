"use client";

import { Modal } from "@/components/field-ops/modal";
import { formatPrice } from "@/lib/catalog/format";
import {
  PRODUCT_STATE_META,
  PRODUCT_TYPE_META,
  type CatalogProduct,
} from "@/lib/catalog/types";
import type { TaxonomyVariant } from "@/lib/taxonomy/types";

type ProductDetailsModalProps = {
  product: CatalogProduct | null;
  variants: TaxonomyVariant[];
  categoryName: string;
  onClose: () => void;
  onOpenImage: () => void;
};

/** Read-only full record for one product, including resolved variant labels. */
export function ProductDetailsModal({
  product,
  variants,
  categoryName,
  onClose,
  onOpenImage,
}: ProductDetailsModalProps) {
  if (!product) return null;
  const meta = PRODUCT_STATE_META[product.state];

  const variantRows = product.attributes
    .map((selection) => {
      const variant = variants.find(
        (candidate) => candidate.variant_id === selection.variantId,
      );
      const options = selection.optionIds
        .map((optionId) =>
          variant?.options.find((option) => option.option_id === optionId),
        )
        .filter((option) => option !== undefined)
        .map((option) => option.option_name_ar);
      return {
        variantId: selection.variantId,
        name: variant?.name_ar ?? `متغير #${selection.variantId}`,
        options,
      };
    })
    .filter((row) => row.options.length > 0);

  return (
    <Modal
      open
      title={product.name}
      eyebrow={product.merchantName}
      description={product.description || "لا يوجد وصف مسجّل لهذا المنتج."}
      onClose={onClose}
      wide
    >
      <div className="prod-detail">
        <div className="prod-detail-media">
          <button
            type="button"
            className="prod-detail-thumb"
            onClick={onOpenImage}
            disabled={!product.imageDataUrl}
            aria-label="عرض الصورة بالحجم الكامل"
          >
            {product.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageDataUrl} alt={product.name} />
            ) : (
              <span>لا توجد صورة</span>
            )}
          </button>
          <span className={`badge ${meta.tone}`}>{meta.label}</span>
        </div>

        <dl className="prod-detail-grid">
          <div>
            <dt>الاسم</dt>
            <dd>{product.name}</dd>
          </div>
          <div>
            <dt>SKU</dt>
            <dd dir="ltr">{product.sku}</dd>
          </div>
          <div>
            <dt>التصنيف</dt>
            <dd>{categoryName || "غير محدد"}</dd>
          </div>
          <div>
            <dt>السعر الأساسي</dt>
            <dd>{formatPrice(product.price)}</dd>
          </div>
          <div>
            <dt>نوع المنتج</dt>
            <dd>{PRODUCT_TYPE_META[product.productType].label}</dd>
          </div>
          <div>
            <dt>الباركود</dt>
            <dd dir="ltr">{product.barcode || "—"}</dd>
          </div>
          <div>
            <dt>ملاحظة المراجعة</dt>
            <dd>{product.reviewNote}</dd>
          </div>
          <div>
            <dt>آخر تحديث</dt>
            <dd dir="ltr">{new Date(product.updatedAt).toLocaleString("ar-EG")}</dd>
          </div>
        </dl>
      </div>

      <section className="prod-detail-variants">
        <h3>المتغيرات</h3>
        {variantRows.length === 0 ? (
          <p className="cat-hint">لا توجد متغيرات مرتبطة بهذا المنتج.</p>
        ) : (
          <ul>
            {variantRows.map((row) => (
              <li key={row.variantId}>
                <strong>{row.name}</strong>
                <span>{row.options.join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
