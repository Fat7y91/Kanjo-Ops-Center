"use client";

import { useCallback, useState } from "react";

import type { CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import type { ProductFormValues } from "@/components/catalog/product-form";
import { categoryIdFromKey } from "@/lib/catalog/category";
import {
  enqueueDrafts,
  removeDraft,
  type CatalogDraft,
  type CatalogDraftPayload,
} from "@/lib/catalog/offline-queue";
import {
  createSkuSeed,
  generateSku,
  isValidBarcode,
  normalizeCode,
} from "@/lib/catalog/sku";
import {
  VariantError,
  finalizeVariantProducts,
  generateVariantMatrix,
  type FinalVariantProduct,
} from "@/lib/catalog/services/variant-service";
import type { CatalogProductType } from "@/lib/catalog/types";
import type { TaxonomyVariant } from "@/lib/taxonomy/types";

function emptyValues(): ProductFormValues {
  return {
    name: "",
    description: "",
    merchant: null,
    productType: "simple",
    categoryKey: "",
    price: "",
    sku: "",
    imageDataUrl: null,
    attributes: {},
    variantPrices: {},
    skuSeed: createSkuSeed(),
  };
}

export type SaveMode = "close" | "another";

type UseProductEntryArgs = {
  merchants: CatalogMerchantOption[];
  variants: TaxonomyVariant[];
  refreshQueue: () => Promise<void>;
};

/**
 * Form state + validation for continuous product entry.
 *
 * Keeping the state machine out of the JSX keeps the container under the
 * 300-line rule and makes the "retain merchant on save-and-add-another"
 * behaviour a single, testable line.
 */
export function useProductEntry({
  merchants,
  variants,
  refreshQueue,
}: UseProductEntryArgs) {
  const [values, setValues] = useState<ProductFormValues>(emptyValues);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const patch = useCallback((next: Partial<ProductFormValues>) => {
    setValues((current) => ({ ...current, ...next }));
  }, []);

  const changeMerchant = useCallback(
    (merchant: CatalogMerchantOption | null) => {
      setValues((current) => ({
        ...current,
        merchant,
        categoryKey: "",
        attributes: {},
        variantPrices: {},
        skuSeed: createSkuSeed(),
      }));
    },
    [],
  );

  function resetDetails(keepMerchant: boolean) {
    setValues((current) => ({
      ...emptyValues(),
      merchant: keepMerchant ? current.merchant : null,
      productType: current.productType,
    }));
  }

  // Editing pulls a queued draft back into the form and drops it from the
  // queue; saving re-queues it with the rep's corrections.
  async function editDraft(draft: CatalogDraft) {
    const payload = draft.payload;
    const merchant =
      merchants.find((option) => option.id === payload.merchantId) ?? null;

    const attributes: Record<number, number[]> = {};
    const variantPrices: Record<string, string> = {};
    for (const selection of payload.attributes) {
      for (const optionId of selection.optionIds) {
        attributes[selection.variantId] = [
          ...(attributes[selection.variantId] ?? []),
          optionId,
        ];
      }
    }
    if (payload.attributes.length > 0) {
      const key = payload.attributes
        .map(
          (selection) => `${selection.variantId}:${selection.optionIds[0]}`,
        )
        .join("|");
      variantPrices[key] = String(payload.price);
    }

    setError("");
    setValues({
      name: payload.name,
      description: payload.description,
      merchant,
      productType: payload.productType,
      categoryKey: payload.categoryKey ?? "",
      price: String(payload.price),
      sku: payload.barcode || payload.sku,
      imageDataUrl: payload.imageDataUrl,
      attributes,
      variantPrices,
      skuSeed: createSkuSeed(),
    });
    await removeDraft(draft.clientProductId);
    await refreshQueue();
  }

  async function save(mode: SaveMode): Promise<boolean> {
    setError("");

    const merchant = values.merchant;
    if (!merchant) {
      setError("اختر التاجر أولاً.");
      return false;
    }
    if (values.name.trim().length < 2) {
      setError("اسم المنتج مطلوب (حرفان على الأقل).");
      return false;
    }
    // Category is an MDM requirement, not optional metadata: block the save
    // locally so the rep never queues an uncategorised draft that the server
    // would later reject.
    const categoryId = categoryIdFromKey(values.categoryKey);
    if (categoryId === null) {
      setError("اختر التصنيف قبل حفظ المنتج — التصنيف مطلوب.");
      return false;
    }
    const isVariable = values.productType === "variable";

    // Variable products are entered through the matrix: one queued draft per
    // combination, each with its own price and deterministic SKU. All naming,
    // SKU and price rules live in the Tier 3 service; this controller only
    // turns a typed error into a rep-facing message.
    const rows: FinalVariantProduct[] = [];

    if (isVariable) {
      const combinations = generateVariantMatrix({
        attributes: values.attributes,
        variants,
      });
      if (combinations.length === 0) {
        setError("اختر خياراً واحداً على الأقل لتوليد تركيبات المتغيرات.");
        return false;
      }
      try {
        rows.push(
          ...finalizeVariantProducts({
            baseName: values.name,
            vendorTypeId: merchant.vendorTypeId,
            skuSeed: values.skuSeed,
            combinations,
            prices: values.variantPrices,
          }),
        );
      } catch (caught) {
        setError(
          caught instanceof VariantError
            ? caught.message
            : "تعذر تجهيز تركيبات المتغيرات.",
        );
        return false;
      }
    } else {
      const price = Number(values.price);
      if (!Number.isFinite(price) || price < 0) {
        setError("أدخل سعراً صحيحاً.");
        return false;
      }
      if (!isValidBarcode(values.sku)) {
        setError("الباركود يجب أن يكون من 8 إلى 14 رقماً.");
        return false;
      }
      // Auto-SKU happens at save time, not upload time, so the rep sees the
      // real code on the queued draft while still offline.
      const typedCode = normalizeCode(values.sku);
      rows.push({
        name: values.name.trim(),
        sku: typedCode || generateSku(merchant.vendorTypeId),
        price,
        attributes: [],
      });
    }

    setBusy(true);
    try {
      // Hand fully hydrated products (name + SKU + price already resolved) to
      // the Tier 4 queue in one pass.
      const payloads: CatalogDraftPayload[] = rows.map((row) => ({
        name: row.name,
        description: values.description.trim(),
        merchantId: merchant.id,
        merchantName: merchant.name,
        vendorTypeId: merchant.vendorTypeId,
        categoryKey: values.categoryKey,
        categoryId,
        productType: values.productType as CatalogProductType,
        sku: row.sku,
        barcode: /^\d{8,14}$/.test(row.sku) ? row.sku : "",
        imageDataUrl: values.imageDataUrl,
        attributes: row.attributes,
        price: row.price,
        state: "draft",
        reviewNote: "",
      }));
      await enqueueDrafts(payloads);

      await refreshQueue();

      resetDetails(mode === "another");
      return true;
    } catch {
      setError("تعذر حفظ المسودة محلياً. تحقق من مساحة التخزين.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    values,
    error,
    busy,
    patch,
    changeMerchant,
    editDraft,
    save,
  };
}
