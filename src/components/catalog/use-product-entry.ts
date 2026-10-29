"use client";

import { useCallback, useState } from "react";

import type { CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import type { ProductFormValues } from "@/components/catalog/product-form";
import {
  enqueueDraft,
  removeDraft,
  type CatalogDraft,
  type CatalogDraftPayload,
} from "@/lib/catalog/draft-queue";
import { categoryIdFromKey } from "@/lib/catalog/category";
import {
  createSkuSeed,
  generateSku,
  isValidBarcode,
  normalizeCode,
} from "@/lib/catalog/sku";
import type {
  CatalogProductType,
  CatalogVariantSelection,
} from "@/lib/catalog/types";
import {
  buildVariantCombinations,
  combinationName,
  combinationSku,
} from "@/lib/catalog/variants";
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

    if (!values.merchant) {
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
    // combination, each with its own price and deterministic SKU.
    const combinations = isVariable
      ? buildVariantCombinations({
          attributes: values.attributes,
          variants,
        })
      : [];

    const rows: Array<{
      name: string;
      sku: string;
      price: number;
      attributes: CatalogVariantSelection[];
    }> = [];

    if (isVariable) {
      if (combinations.length === 0) {
        setError("اختر خياراً واحداً على الأقل لتوليد تركيبات المتغيرات.");
        return false;
      }
      for (const [index, combination] of combinations.entries()) {
        const raw = values.variantPrices[combination.key] ?? "";
        const price = Number(raw);
        if (!raw.trim() || !Number.isFinite(price) || price < 0) {
          setError(
            `أدخل سعراً صحيحاً لكل تركيبة — الناقص: ${
              combinationName(values.name, combination.label) || "تركيبة"
            }.`,
          );
          return false;
        }
        rows.push({
          name: combinationName(values.name, combination.label),
          sku: combinationSku(
            values.merchant.vendorTypeId,
            values.skuSeed,
            index,
          ),
          price,
          attributes: combination.selections,
        });
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
        sku: typedCode || generateSku(values.merchant.vendorTypeId),
        price,
        attributes: [],
      });
    }

    setBusy(true);
    try {
      for (const row of rows) {
        const payload: CatalogDraftPayload = {
          name: row.name,
          description: values.description.trim(),
          merchantId: values.merchant.id,
          merchantName: values.merchant.name,
          vendorTypeId: values.merchant.vendorTypeId,
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
        };
        await enqueueDraft(payload);
      }

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
