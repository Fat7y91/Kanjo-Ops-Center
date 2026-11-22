"use client";

import { CascadingTaxonomy } from "@/components/catalog/cascading-taxonomy";
import { ProductImageField } from "@/components/catalog/product-image-field";
import { useProductEdit } from "@/components/catalog/use-product-edit";
import { VariantEditor } from "@/components/catalog/variant-editor";
import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import {
  TextAreaField,
  TextField,
} from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import type {
  CatalogProduct,
  CatalogProductState,
  CatalogProductType,
} from "@/lib/catalog/types";
import type {
  TaxonomyCategory,
  TaxonomyVariant,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type ProductEditModalProps = {
  product: CatalogProduct | null;
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  /** Merchant vendor type, used when the product row has no vendor type. */
  merchantVendorTypeId?: number | null;
  onClose: () => void;
  onSaved: (product: CatalogProduct) => void;
};

const PRODUCT_TYPES: { value: CatalogProductType; label: string }[] = [
  { value: "simple", label: "منتج بسيط" },
  { value: "variable", label: "منتج متغير" },
];

const STATES: { value: CatalogProductState; label: string }[] = [
  { value: "pending_review", label: "قيد المراجعة" },
  { value: "completed", label: "مكتمل" },
  { value: "published", label: "منشور" },
];

/**
 * Full-field correction modal for one catalog product.
 *
 * Auto-imported rows are editable exactly like manual ones, so a wrong image,
 * name, price, barcode, category, product type or variant set can be repaired
 * from the list or the details panel without leaving the catalog screen.
 */
export function ProductEditModal({
  product,
  vendorTypes,
  categories,
  variants,
  merchantVendorTypeId,
  onClose,
  onSaved,
}: ProductEditModalProps) {
  if (!product) return null;
  return (
    <ProductEditForm
      key={product.id}
      product={product}
      vendorTypes={vendorTypes}
      categories={categories}
      variants={variants}
      merchantVendorTypeId={merchantVendorTypeId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function ProductEditForm({
  product,
  vendorTypes,
  categories,
  variants,
  merchantVendorTypeId,
  onClose,
  onSaved,
}: ProductEditModalProps & { product: CatalogProduct }) {
  const form = useProductEdit({
    product,
    categories,
    variants,
    merchantVendorTypeId,
    onClose,
    onSaved,
  });
  const isVariable = form.productType === "variable";

  return (
    <Modal
      open
      title="تعديل المنتج"
      eyebrow={product.merchantName}
      description={product.name}
      onClose={() => {
        if (!form.busy) onClose();
      }}
      wide
    >
      <div className="cat-form">
        <TextField
          label="اسم المنتج"
          value={form.name}
          onChange={(event) => form.setName(event.target.value)}
          required
        />
        <TextAreaField
          label="الوصف"
          value={form.description}
          onChange={(event) => form.setDescription(event.target.value)}
        />

        <CascadingTaxonomy
          vendorTypeId={form.vendorTypeId}
          vendorTypes={vendorTypes}
          categories={categories}
          variants={variants}
          categoryKey={form.categoryKey}
          attributes={form.attributes}
          showVariants={isVariable}
          onCategoryChange={form.setCategoryKey}
          onAttributesChange={form.setAttributes}
          disabled={form.busy}
        />

        <SelectMenu
          label="نوع المنتج"
          value={form.productType}
          onChange={(value) => form.setProductType(value)}
          options={PRODUCT_TYPES}
          disabled={form.busy}
        />

        {isVariable ? (
          <section className="cat-block">
            <div className="cat-label-row">
              <span className="cat-label">جدول المتغيرات</span>
              <Button
                size="sm"
                variant="accent"
                disabled={form.busy}
                onClick={form.addSelectedVariants}
              >
                إضافة الخيارات المحددة
              </Button>
            </div>
            <VariantEditor
              rows={form.variantRows}
              disabled={form.busy}
              onChange={form.setVariantRows}
            />
          </section>
        ) : null}

        <div className="cat-form-grid">
          <TextField
            label={isVariable ? "السعر الأساسي" : "السعر"}
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(event) => form.setPrice(event.target.value)}
            required={!isVariable}
          />
          <TextField
            label="السعر قبل الخصم"
            type="number"
            min={0}
            step="0.01"
            value={form.compareAtPrice}
            onChange={(event) => form.setCompareAtPrice(event.target.value)}
          />
          <TextField
            label="وحدة البيع"
            value={form.unit}
            onChange={(event) => form.setUnit(event.target.value)}
            placeholder="كيلو / علبة"
          />
          <TextField
            label="المخزون"
            type="number"
            min={0}
            step="1"
            value={form.stockQuantity}
            onChange={(event) => form.setStockQuantity(event.target.value)}
          />
        </div>

        <div className="cat-form-grid">
          <TextField
            label="SKU"
            dir="ltr"
            value={form.sku}
            onChange={(event) => form.setSku(event.target.value)}
          />
          <TextField
            label="الباركود"
            dir="ltr"
            inputMode="numeric"
            value={form.barcode}
            onChange={(event) => form.setBarcode(event.target.value)}
          />
        </div>

        <div className="cat-form-grid">
          <SelectMenu
            label="حالة المنتج"
            value={form.state}
            onChange={(value) => form.setState(value)}
            options={STATES}
            disabled={form.busy}
          />
          <TextField
            label="ملاحظة المراجعة"
            value={form.reviewNote}
            onChange={(event) => form.setReviewNote(event.target.value)}
          />
        </div>

        <ProductImageField
          value={form.imageDataUrl}
          onChange={form.setImageDataUrl}
          disabled={form.busy}
        />

        {form.error ? (
          <p className="form-error" role="alert">
            {form.error}
          </p>
        ) : null}

        <div className="row-actions">
          <Button
            variant="primary"
            disabled={form.busy}
            onClick={() => void form.save()}
          >
            {form.busy ? "جارٍ الحفظ…" : "حفظ التعديلات"}
          </Button>
          <Button variant="quiet" disabled={form.busy} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}
