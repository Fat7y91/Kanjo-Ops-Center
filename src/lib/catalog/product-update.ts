import { assertCategoryInVendor } from "@/lib/taxonomy/store";
import type { CatalogProduct } from "@/lib/catalog/types";
import { normalizeCode } from "@/lib/catalog/sku";
import { getMerchantById } from "@/lib/field-ops/store";

import {
  deleteProductRow,
  getProductRow,
  updateProductRow,
} from "./product-repository";
import { CatalogError, bumpRevision } from "./store";

export type CatalogProductUpdateInput = {
  name: string;
  description: string;
  categoryId: number;
  sku: string;
  barcode: string;
  imageDataUrl: string | null;
  price: number;
};

/**
 * Manual correction of a stored product.
 *
 * Autopilot rows are intentionally not special-cased: a merchant can fix the
 * name, price, barcode, category or image of any product they can see.
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

  const stored = await updateProductRow(productId, {
    name: input.name.trim(),
    description: input.description.trim(),
    categoryKey: category.key,
    sku: normalizeCode(input.sku),
    barcode: normalizeCode(input.barcode),
    imageDataUrl: input.imageDataUrl,
    price: input.price,
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
