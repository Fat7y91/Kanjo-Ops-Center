import { assertCategoryInVendor } from "@/lib/taxonomy/store";
import type {
  CatalogProduct,
  CatalogProductState,
  CatalogProductType,
  CatalogVariantSelection,
} from "@/lib/catalog/types";
import { normalizeCode } from "@/lib/catalog/sku";
import {
  normalizeVariantDrafts,
  type VariantEditDraft,
} from "@/lib/catalog/variant-edit";
import { getMerchantById } from "@/lib/field-ops/store";

import {
  deleteProductRow,
  getProductRow,
  updateProductRow,
} from "./product-repository";
import { CatalogError, bumpRevision } from "./store";

export type CatalogVariantEditInput = VariantEditDraft;

export type CatalogProductUpdateInput = {
  name: string;
  description: string;
  categoryId: number;
  sku: string;
  barcode: string;
  imageDataUrl: string | null;
  price?: number;
  productType?: CatalogProductType;
  variants?: CatalogVariantEditInput[];
  state?: CatalogProductState;
  reviewNote?: string;
  unit?: string;
  stockQuantity?: number | null;
  compareAtPrice?: number | null;
};

/**
 * Manual correction of a stored product.
 *
 * Autopilot rows are intentionally not special-cased: a merchant can fix the
 * name, price, barcode, category, image, product type and variant set of any
 * product they can see. A simple → variable conversion replaces the variant
 * set in the same atomic row update.
 */
export async function updateProduct(
  productId: string,
  input: CatalogProductUpdateInput,
): Promise<CatalogProduct> {
  const existing = await getProductRow(productId);
  if (!existing) {
    throw new CatalogError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
  }

  const merchant = await getMerchantById(existing.merchantId);
  if (!merchant) {
    throw new CatalogError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }

  const vendorTypeId = existing.vendorTypeId ?? merchant.vendorTypeId;
  const category = assertCategoryInVendor(vendorTypeId, input.categoryId);
  const productType = input.productType ?? existing.productType;

  let attributes: CatalogVariantSelection[] = [];
  let basePrice = input.price ?? existing.price;
  if (productType === "variable") {
    const normalized = normalizeVariantDrafts(input.variants ?? []);
    if (!normalized.ok) {
      throw new CatalogError("INVALID_VARIANTS", normalized.message, 422);
    }
    attributes = normalized.attributes;
    basePrice = input.price ?? normalized.basePrice;
  }

  const stored = await updateProductRow(productId, {
    name: input.name.trim(),
    description: input.description.trim(),
    categoryKey: category.key,
    sku: normalizeCode(input.sku),
    barcode: normalizeCode(input.barcode),
    imageDataUrl: input.imageDataUrl,
    price: basePrice,
    unit: input.unit ?? existing.unit,
    stockQuantity:
      input.stockQuantity === undefined
        ? existing.stockQuantity
        : input.stockQuantity,
    compareAtPrice:
      input.compareAtPrice === undefined
        ? existing.compareAtPrice
        : input.compareAtPrice,
    productType,
    attributes,
    state: input.state ?? existing.state,
    reviewNote: input.reviewNote ?? existing.reviewNote,
  });
  bumpRevision();
  if (!stored) {
    throw new CatalogError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
  }
  return stored;
}

/**
 * Permanently removes a catalog product.
 *
 * Fails with a typed 404 when the row is gone (a double submit or a stale
 * screen), so the UI never reports a silent success.
 */
export async function deleteProduct(productId: string): Promise<void> {
  const existing = await getProductRow(productId);
  if (!existing) {
    throw new CatalogError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
  }

  const deleted = await deleteProductRow(productId);
  if (!deleted) {
    throw new CatalogError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
  }
  bumpRevision();
}
