/**
 * Catalog persistence (Tier 4).
 *
 * The only place that couples the catalog store to merchant/city lookups for
 * image QA. Business rules live in `services/image-qa-service.ts`; this module
 * answers "what exists" and performs the write.
 */

import { getMerchantById } from "@/lib/field-ops/store";
import {
  catalogRevision,
  completeImageQa,
  listProducts,
} from "@/lib/catalog/store";
import type { CatalogProduct } from "@/lib/catalog/types";

export type CatalogRecord = {
  product: CatalogProduct;
  /** City owning the merchant, or `null` when the merchant is unknown. */
  cityId: string | null;
};

/** Every product with its resolved merchant city. */
export function listCatalogRecords(): CatalogRecord[] {
  return listProducts().map((product) => ({
    product,
    cityId: getMerchantById(product.merchantId)?.cityId ?? null,
  }));
}

export function findCatalogRecord(
  productId: string,
): CatalogRecord | undefined {
  const product = listProducts().find((item) => item.id === productId);
  if (!product) return undefined;
  return {
    product,
    cityId: getMerchantById(product.merchantId)?.cityId ?? null,
  };
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
export function commitImageQa(
  productId: string,
  patch: ImageQaCommitPatch,
): ImageQaCommit {
  const product = completeImageQa(productId, patch);
  return { product, revision: catalogRevision() };
}

export function currentCatalogRevision(): number {
  return catalogRevision();
}
