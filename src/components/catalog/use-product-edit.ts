"use client";

import { useState } from "react";

import { createClientId, generateSku } from "@/lib/catalog/sku";
import type {
  CatalogProduct,
  CatalogProductState,
  CatalogProductType,
} from "@/lib/catalog/types";
import type { TaxonomyCategory, TaxonomyVariant } from "@/lib/taxonomy/types";
import {
  editableRowsFromProduct,
  selectionsFromProduct,
  type EditableVariantRow,
  type VariantEditDraft,
} from "@/lib/catalog/variant-edit";

type UseProductEditArgs = {
  product: CatalogProduct;
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  merchantVendorTypeId?: number | null;
  onClose: () => void;
  onSaved: (product: CatalogProduct) => void;
};

/** View state and handlers for the full-field product edit modal. */
export function useProductEdit({
  product,
  categories,
  variants,
  merchantVendorTypeId,
  onClose,
  onSaved,
}: UseProductEditArgs) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [sku, setSku] = useState(product.sku);
  const [barcode, setBarcode] = useState(product.barcode);
  const [price, setPrice] = useState(product.price.toFixed(2));
  const [compareAtPrice, setCompareAtPrice] = useState(
    product.compareAtPrice == null ? "" : product.compareAtPrice.toFixed(2),
  );
  const [unit, setUnit] = useState(product.unit);
  const [stockQuantity, setStockQuantity] = useState(
    product.stockQuantity == null ? "" : String(product.stockQuantity),
  );
  const [productType, setProductType] = useState<CatalogProductType>(
    product.productType,
  );
  const [state, setState] = useState<CatalogProductState>(product.state);
  const [reviewNote, setReviewNote] = useState(product.reviewNote);
  const [categoryKey, setCategoryKey] = useState(product.categoryKey ?? "");
  const [attributes, setAttributes] = useState<Record<number, number[]>>(
    () => selectionsFromProduct(product, variants),
  );
  const [variantRows, setVariantRows] = useState<EditableVariantRow[]>(() =>
    editableRowsFromProduct(product, variants),
  );
  const [imageDataUrl, setImageDataUrl] = useState(product.imageDataUrl);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const vendorTypeId = product.vendorTypeId ?? merchantVendorTypeId ?? null;
  const selectedCategory = categories.find(
    (category) => category.key === categoryKey,
  );

  function addSelectedVariants() {
    const additions: EditableVariantRow[] = [];
    for (const [groupKey, optionIds] of Object.entries(attributes)) {
      const variantId = Number(groupKey);
      const group = variants.find((entry) => entry.variant_id === variantId);
      for (const optionId of optionIds) {
        const option = group?.options.find(
          (entry) => entry.option_id === optionId,
        );
        if (!option) continue;
        const exists = variantRows.some(
          (row) =>
            row.variantId === variantId && row.optionIds.includes(optionId),
        );
        if (exists) continue;
        additions.push({
          id: createClientId("variant"),
          variantId,
          optionIds: [optionId],
          label: `${group?.name_ar ?? "متغير"} — ${option.option_name_ar}`,
          price: price || variantRows[0]?.price || "",
          sku: generateSku(vendorTypeId),
          barcode: "",
          available: true,
          imageUrl: "",
        });
      }
    }

    if (additions.length === 0) {
      setError("اختر خياراً جديداً من المتغيرات لإضافته إلى الجدول.");
      return;
    }
    setError("");
    setVariantRows((current) => [...current, ...additions]);
  }

  function buildVariants(): VariantEditDraft[] | null {
    if (variantRows.length === 0) {
      setError("أضف متغيراً واحداً على الأقل للمنتج المتغير.");
      return null;
    }
    const drafts: VariantEditDraft[] = [];
    for (const [index, row] of variantRows.entries()) {
      const value = Number(row.price);
      if (!row.price.trim() || !Number.isFinite(value) || value < 0) {
        setError(`أدخل سعراً صحيحاً للمتغير رقم ${index + 1}.`);
        return null;
      }
      if (row.optionIds.length === 0) {
        setError(
          `اختر خياراً واحداً على الأقل للمتغير رقم ${index + 1} من قائمة المتغيرات.`,
        );
        return null;
      }
      drafts.push({
        variantId: row.variantId,
        optionIds: row.optionIds,
        label: row.label,
        price: value,
        sku: row.sku,
        barcode: row.barcode,
        available: row.available,
        imageUrl: row.imageUrl || null,
      });
    }
    return drafts;
  }

  async function save() {
    setError("");
    if (!selectedCategory) {
      setError("اختر التصنيف قبل الحفظ.");
      return;
    }
    const variantsPayload =
      productType === "variable" ? buildVariants() : [];
    if (variantsPayload === null) return;

    if (productType === "simple") {
      const value = Number(price);
      if (!price.trim() || !Number.isFinite(value) || value < 0) {
        setError("أدخل سعراً صحيحاً للمنتج.");
        return;
      }
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
          unit,
          stockQuantity:
            stockQuantity.trim() === "" ? null : Number(stockQuantity),
          compareAtPrice:
            compareAtPrice.trim() === "" ? null : Number(compareAtPrice),
          productType,
          state,
          reviewNote,
          ...(price.trim() === "" ? {} : { price: Number(price) }),
          ...(productType === "variable" ? { variants: variantsPayload } : {}),
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

  return {
    name,
    setName,
    description,
    setDescription,
    sku,
    setSku,
    barcode,
    setBarcode,
    price,
    setPrice,
    compareAtPrice,
    setCompareAtPrice,
    unit,
    setUnit,
    stockQuantity,
    setStockQuantity,
    productType,
    setProductType,
    state,
    setState,
    reviewNote,
    setReviewNote,
    categoryKey,
    setCategoryKey,
    attributes,
    setAttributes,
    variantRows,
    setVariantRows,
    imageDataUrl,
    setImageDataUrl,
    vendorTypeId,
    error,
    busy,
    addSelectedVariants,
    save,
  };
}
