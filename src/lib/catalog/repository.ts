/**
 * Catalog persistence (Tier 4).
 *
 * The only place that couples the catalog store to merchant/city lookups for
 * image QA. Business rules live in `services/image-qa-service.ts`; this module
 * answers "what exists" and performs the write.
 */

import { getMerchantById, listMerchants } from "@/lib/field-ops/store";
import {
  catalogRevision,
  completeImageQa,
  listProducts,
} from "@/lib/catalog/store";
import { getProductRow } from "@/lib/catalog/product-repository";
import type { CatalogProduct } from "@/lib/catalog/types";

export type CatalogRecord = {
  product: CatalogProduct;
  /** City owning the merchant, or `null` when the merchant is unknown. */
  cityId: string | null;
};

/** Every product with its resolved merchant city. */
export async function listCatalogRecords(): Promise<CatalogRecord[]> {
  const [products, merchants] = await Promise.all([
    listProducts(),
    listMerchants(),
  ]);
  const cityOf = new Map(merchants.map((merchant) => [merchant.id, merchant.cityId]));
  return products.map((product) => ({
    product,
    cityId: cityOf.get(product.merchantId) ?? null,
  }));
}

export async function findCatalogRecord(
  productId: string,
): Promise<CatalogRecord | undefined> {
  const product = await getProductRow(productId);
  if (!product) return undefined;
  const merchant = await getMerchantById(product.merchantId);
  return { product, cityId: merchant?.cityId ?? null };
}


export type ImageQaCommitPatch = {
  imageDataUrl?: string | null;
  reviewNote?: string;
};

export type ImageQaCommit = {
  product: CatalogProduct;
  revision: number;
};

/**
 * Persists an image-QA transition. The store owns the pure state machine and
 * the revision bump; this wrapper only shapes the result for controllers.
 */
export async function commitImageQa(
  productId: string,
  patch: ImageQaCommitPatch,
): Promise<ImageQaCommit> {
  const product = await completeImageQa(productId, patch);
  return { product, revision: catalogRevision() };
}

export function currentCatalogRevision(): number {
  return catalogRevision();
}
