"use client";

import { Protect } from "@/components/auth/protect";
import { CatalogImage } from "@/components/catalog/catalog-image";
import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { formatPrice, resolveDisplayImageUrl } from "@/lib/catalog/format";
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
  onEdit: () => void;
  onDelete: () => void;
  onOpenImage: () => void;
};

/** Read-only full record for one product, including resolved variant labels. */
export function ProductDetailsModal({
  product,
  variants,
  categoryName,
  onClose,
  onEdit,
  onDelete,
  onOpenImage,
}: ProductDetailsModalProps) {
  if (!product) return null;
  const meta = PRODUCT_STATE_META[product.state];
  const imageUrl = resolveDisplayImageUrl(product.imageDataUrl);

  const variantRows = product.attributes
    .map((selection, index) => {
      const variant =
        selection.variantId == null
          ? undefined
          : variants.find(
              (candidate) => candidate.variant_id === selection.variantId,
            );
      const options = selection.optionIds
        .map((optionId) =>
          variant?.options.find((option) => option.option_id === optionId),
        )
        .filter((option) => option !== undefined)
        .map((option) => option.option_name_ar);
      return {
        key: `${selection.variantId ?? "x"}-${selection.optionIds.join("-")}-${index}`,
        variantId: selection.variantId ?? null,
        name:
          selection.variantLabel?.trim() ||
          variant?.name_ar ||
          (selection.variantId == null
            ? "متغير غير محدد"
            : `متغير #${selection.variantId}`),
        options,
        price:
          selection.price_minor == null
            ? null
            : selection.price_minor / 100,
        sku: selection.sku ?? "",
        available: selection.available ?? true,
      };
    })
    .filter((row) => row.options.length > 0 || row.name);

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
            disabled={!imageUrl}
            aria-label="عرض الصورة بالحجم الكامل"
          >
            {imageUrl ? (
              <CatalogImage src={product.imageDataUrl} alt={product.name} />
            ) : (
              <span>لا توجد صورة</span>
            )}
          </button>
          <span className={`badge ${meta.tone}`}>{meta.label}</span>
          <Protect require={["edit_catalog", "add_catalog"]} mode="any">
            <Button size="sm" variant="quiet" onClick={onEdit}>
              تعديل
            </Button>
          </Protect>
          <Protect require={["delete_products"]}>
            <Button size="sm" variant="quiet" onClick={onDelete}>
              حذف
            </Button>
          </Protect>
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
            <dt>السعر قبل الخصم</dt>
            <dd>
              {product.compareAtPrice == null
                ? "—"
                : formatPrice(product.compareAtPrice)}
            </dd>
          </div>
          <div>
            <dt>وحدة البيع</dt>
            <dd>{product.unit || "—"}</dd>
          </div>
          <div>
            <dt>المخزون</dt>
            <dd>{product.stockQuantity == null ? "غير متتبع" : product.stockQuantity}</dd>
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
            <dd dir="ltr">{new Date(product.updatedAt).toLocaleString("ar-EG-u-nu-latn")}</dd>
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
              <li key={row.key}>
                <strong>{row.name}</strong>
                <span>{row.options.join(" · ") || "بدون خيارات"}</span>
                <span>
                  {row.price == null ? "بدون سعر" : formatPrice(row.price)}
                  {row.sku ? ` · ${row.sku}` : ""}
                  {row.available ? "" : " · غير متاح"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <QaMetadataPanel metadata={product.qaMetadata} />
    </Modal>
  );
}

/** Readable provenance rows for the known V1 image-QA keys. */
const QA_FIELDS: readonly { key: string; label: string }[] = [
  { key: "image_uploaded_by", label: "رفع الصورة" },
  { key: "image_uploaded_at", label: "وقت الرفع" },
  { key: "image_locked_by", label: "قفل الصورة" },
  { key: "image_locked_at", label: "وقت القفل" },
  { key: "edit_type", label: "نوع التعديل" },
  { key: "edited_by", label: "عدّلها" },
  { key: "edited_at", label: "وقت التعديل" },
];

function renderQaValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    // Timestamps (ISO strings) render in the workspace locale; anything else
    // is shown verbatim.
    if (!Number.isNaN(parsed) && /\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleString("ar-EG-u-nu-latn");
    }
    return value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * V1 image-provenance panel.
 *
 * Renders the known V1 keys in a fixed order and hides the panel entirely for a
 * V2-native product (empty metadata). Unknown keys are preserved in the stored
 * JSON but not surfaced here, so the panel stays readable.
 */
function QaMetadataPanel({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  const rows = QA_FIELDS.filter(
    (field) => metadata[field.key] !== undefined && metadata[field.key] !== null,
  );
  if (rows.length === 0) return null;

  return (
    <section className="prod-detail-variants">
      <h3>سجل صور المنتج (V1)</h3>
      <dl className="prod-detail-grid">
        {rows.map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>{renderQaValue(metadata[field.key])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
