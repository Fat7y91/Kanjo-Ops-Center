"use client";

import { useState } from "react";

import { CascadingTaxonomy } from "@/components/catalog/cascading-taxonomy";
import { ProductImageField } from "@/components/catalog/product-image-field";
import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/form-inputs";
import type { CatalogProduct } from "@/lib/catalog/types";
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
  onClose: () => void;
  onSaved: (product: CatalogProduct) => void;
};

/**
 * Full-field correction modal for one catalog product.
 *
 * Auto-imported rows are editable exactly like manual ones, so a wrong image,
 * name, price, barcode or category can be repaired from the list or the details
 * panel without leaving the catalog screen.
 */
export function ProductEditModal({
  product,
  vendorTypes,
  categories,
  variants,
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
  onClose,
  onSaved,
}: ProductEditModalProps & { product: CatalogProduct }) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [sku, setSku] = useState(product.sku);
  const [barcode, setBarcode] = useState(product.barcode);
  const [price, setPrice] = useState(String(product.price));
  const [categoryKey, setCategoryKey] = useState(product.categoryKey ?? "");
  const [imageDataUrl, setImageDataUrl] = useState(product.imageDataUrl);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedCategory = categories.find(
    (category) => category.key === categoryKey,
  );

  async function save() {
    setError("");
    if (!selectedCategory) {
      setError("اختر التصنيف قبل الحفظ.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/catalog/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          categoryId: selectedCategory.id,
          sku,
          barcode,
          imageDataUrl,
          price: Number(price),
        }),
      });
      const payload = (await response.json()) as {
        product?: CatalogProduct;
        error?: string;
        message?: string;
      };
      if (!response.ok || !payload.product) {
        setError(payload.error ?? payload.message ?? "تعذر حفظ التعديلات.");
        return;
      }
      onSaved(payload.product);
      onClose();
    } catch {
      setError("تعذر الوصول إلى الخادم. أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="تعديل المنتج"
      eyebrow={product.merchantName}
      description={product.name}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="cat-form">
        <TextField
          label="اسم المنتج"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <TextAreaField
          label="الوصف"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="cat-field-row">
          <TextField
            label="SKU"
            dir="ltr"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
          />
          <TextField
            label="الباركود"
            dir="ltr"
            inputMode="numeric"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
          />
          <TextField
            label="السعر"
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            required
          />
        </div>

        <CascadingTaxonomy
          vendorTypeId={product.vendorTypeId}
          vendorTypes={vendorTypes}
          categories={categories}
          variants={variants}
          categoryKey={categoryKey}
          attributes={{}}
          showVariants={false}
          onCategoryChange={setCategoryKey}
          onAttributesChange={() => undefined}
        />

        <ProductImageField
          value={imageDataUrl}
          onChange={setImageDataUrl}
          disabled={busy}
        />

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="row-actions">
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "جارٍ الحفظ…" : "حفظ التعديلات"}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}
