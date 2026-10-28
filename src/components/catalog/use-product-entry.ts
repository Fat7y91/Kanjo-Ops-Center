"use client";

import { useCallback, useState } from "react";

import type { CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import type { ProductFormValues } from "@/components/catalog/product-form";
import {
  enqueueDraft,
  type CatalogDraftPayload,
} from "@/lib/catalog/draft-queue";
import {
  generateSku,
  isValidBarcode,
  normalizeCode,
} from "@/lib/catalog/sku";
import type { CatalogProductType } from "@/lib/catalog/types";

const EMPTY_VALUES: ProductFormValues = {
  name: "",
  description: "",
  merchant: null,
  productType: "simple",
  categoryKey: "",
  price: "",
  sku: "",
  imageDataUrl: null,
  attributes: {},
};

export type SaveMode = "close" | "another";

type UseProductEntryArgs = {
  refreshQueue: () => Promise<void>;
};

/**
 * Form state + validation for continuous product entry.
 *
 * Keeping the state machine out of the JSX keeps the container under the
 * 300-line rule and makes the "retain merchant on save-and-add-another"
 * behaviour a single, testable line.
 */
export function useProductEntry({ refreshQueue }: UseProductEntryArgs) {
  const [values, setValues] = useState<ProductFormValues>(EMPTY_VALUES);
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
      }));
    },
    [],
  );

  function resetDetails(keepMerchant: boolean) {
    setValues((current) => ({
      ...EMPTY_VALUES,
      merchant: keepMerchant ? current.merchant : null,
      productType: current.productType,
    }));
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
    const price = Number(values.price);
    if (!Number.isFinite(price) || price < 0) {
      setError("أدخل سعراً صحيحاً.");
      return false;
    }
    if (!isValidBarcode(values.sku)) {
      setError("الباركود يجب أن يكون من 8 إلى 14 رقماً.");
      return false;
    }

    setBusy(true);
    try {
      // Simple products carry no variant options, even if the rep toggled some
      // before switching the type back.
      const attributes =
        values.productType === "variable"
          ? Object.entries(values.attributes)
              .filter(([, optionIds]) => optionIds.length > 0)
              .map(([variantId, optionIds]) => ({
                variantId: Number(variantId),
                optionIds,
              }))
          : [];

      // Auto-SKU happens at save time, not upload time, so the rep sees the
      // real code on the queued draft while still offline.
      const typedCode = normalizeCode(values.sku);
      const sku = typedCode || generateSku(values.merchant.vendorTypeId);

      const payload: CatalogDraftPayload = {
        name: values.name.trim(),
        description: values.description.trim(),
        merchantId: values.merchant.id,
        merchantName: values.merchant.name,
        vendorTypeId: values.merchant.vendorTypeId,
        categoryKey: values.categoryKey || null,
        productType: values.productType as CatalogProductType,
        sku,
        barcode: /^\d{8,14}$/.test(sku) ? sku : "",
        imageDataUrl: values.imageDataUrl,
        attributes,
        price,
        state: "draft",
        reviewNote: "",
      };

      await enqueueDraft(payload);
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
    save,
  };
}
