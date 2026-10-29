/**
 * Image QA business service (Tier 3).
 *
 * Pure rules for the catalog image review workflow. This module owns the
 * `pending_review → completed` state machine and the city-scope filter. It has
 * zero React, Next or IndexedDB dependencies; the repository is injected so the
 * rules stay testable.
 */

import type { CatalogProduct } from "@/lib/catalog/types";

/** Errors raised by the image-QA state machine, mapped to HTTP by the API. */
export class ImageQaError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "ImageQaError";
    this.code = code;
    this.status = status;
  }
}

export type ImageQaPatch = {
  imageDataUrl?: string | null;
  reviewNote?: string;
};

/** Products awaiting image QA. */
export const QA_PENDING_STATE = "pending_review" as const;
/** State a product lands in once its image is approved. */
export const QA_COMPLETED_STATE = "completed" as const;

/**
 * Keeps only products whose merchant city is inside the reviewer's scope.
 * `cityOf` is supplied by the controller so the service never imports the
 * field-ops store.
 */
export function filterByCityScope(
  products: CatalogProduct[],
  effectiveCityIds: readonly string[],
  cityOf: (merchantId: string) => string | undefined,
): CatalogProduct[] {
  const allowed = new Set(effectiveCityIds);
  return products.filter((product) => {
    const cityId = cityOf(product.merchantId);
    return cityId !== undefined && allowed.has(cityId);
  });
}

/** Narrows a list to products that still need an image decision. */
export function pendingReviewOnly(
  products: CatalogProduct[],
): CatalogProduct[] {
  return products.filter((product) => product.state === QA_PENDING_STATE);
}

/**
 * Validates a pending→completed transition without mutating anything.
 *
 * Returns the normalised review note and the image to write (undefined means
 * "keep the current image").
 */
export function assertImageQaTransition(
  product: CatalogProduct | undefined,
  patch: ImageQaPatch,
): { imageDataUrl: string | undefined } {
  if (!product) {
    throw new ImageQaError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
  }
  if (product.state !== QA_PENDING_STATE) {
    throw new ImageQaError(
      "IMAGE_QA_NOT_PENDING",
      "لا يمكن مراجعة صورة منتج ليس بانتظار المراجعة.",
    );
  }

  if (patch.imageDataUrl !== undefined) {
    const nextImage = patch.imageDataUrl ?? null;
    if (!nextImage) {
      throw new ImageQaError(
        "IMAGE_REQUIRED",
        "ارفع الصورة المحسنة أو اعتمد الصورة الحالية.",
      );
    }
    return { imageDataUrl: nextImage };
  }

  return { imageDataUrl: undefined };
}

/**
 * Pure transition for the Image QA workflow.
 *
 * Mutates the supplied product in place and returns it so the caller owns
 * persistence (revision bump, store write). Keeping it pure makes the state
 * machine testable without touching global state.
 */
export function applyImageQa(
  product: CatalogProduct | undefined,
  patch: ImageQaPatch,
  now: string,
): CatalogProduct {
  assertImageQaTransition(product, patch);
  // `assertImageQaTransition` already proved the product exists.
  const target = product as CatalogProduct;

  if (patch.imageDataUrl !== undefined) {
    target.imageDataUrl = patch.imageDataUrl ?? null;
  }

  target.state = QA_COMPLETED_STATE;
  target.reviewNote = patch.reviewNote?.trim() || "اكتملت مراجعة الصورة";
  target.updatedAt = now;
  return target;
}

/** Convenience wrapper: approve the current image untouched. */
export function applyApproveImage(
  product: CatalogProduct | undefined,
  now: string,
): CatalogProduct {
  return applyImageQa(product, {}, now);
}

/**
 * Convenience wrapper: replace the image, then complete the review. Empty or
 * missing images are rejected by the shared transition.
 */
export function applyUploadEnhancedImage(
  product: CatalogProduct | undefined,
  nextImage: string,
  now: string,
): CatalogProduct {
  return applyImageQa(product, { imageDataUrl: nextImage }, now);
}

/* ── Controller-facing orchestration ──────────────────────────────────────
 *
 * These functions take an injected repository so the service keeps zero
 * imports from Tier 4. They own the business rules for a single QA request:
 * city scope, state validity and the resulting status transition.
 */

export type ImageQaRecord = {
  product: CatalogProduct;
  cityId: string | null;
};

export type ImageQaRepository = {
  listRecords(): ImageQaRecord[];
  findRecord(productId: string): ImageQaRecord | undefined;
  commit(
    productId: string,
    patch: ImageQaPatch,
  ): { product: CatalogProduct; revision: number };
};

function assertInScope(record: ImageQaRecord | undefined, cityIds: readonly string[]): ImageQaRecord {
  if (!record || record.cityId === null) {
    throw new ImageQaError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
  }
  if (!cityIds.includes(record.cityId)) {
    throw new ImageQaError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
  }
  return record;
}

/**
 * Products awaiting QA, strictly filtered to the reviewer's allowed cities.
 * Records are injected by the repository layer.
 */
export function getPendingReviewProducts(
  records: ImageQaRecord[],
  effectiveCityIds: readonly string[],
): CatalogProduct[] {
  const allowed = new Set(effectiveCityIds);
  return records
    .filter(
      (record) =>
        record.cityId !== null &&
        allowed.has(record.cityId) &&
        record.product.state === QA_PENDING_STATE,
    )
    .map((record) => record.product)
    .sort((left, right) => left.name.localeCompare(right.name, "ar"));
}

/** Provides the QA queue for a repository without leaking it into the UI. */
export function pendingProductsFor(
  repository: ImageQaRepository,
  effectiveCityIds: readonly string[],
): CatalogProduct[] {
  return getPendingReviewProducts(repository.listRecords(), effectiveCityIds);
}

/**
 * `pending_review → completed`, approving the current image untouched.
 */
export function approveImage(
  repository: ImageQaRepository,
  productId: string,
  effectiveCityIds: readonly string[],
): { product: CatalogProduct; revision: number } {
  const record = assertInScope(repository.findRecord(productId), effectiveCityIds);
  assertImageQaTransition(record.product, {});
  return repository.commit(productId, {});
}

/**
 * Replaces the product image and completes the review in one transition.
 */
export function uploadEnhancedImage(
  repository: ImageQaRepository,
  productId: string,
  newImage: string,
  effectiveCityIds: readonly string[],
): { product: CatalogProduct; revision: number } {
  const record = assertInScope(repository.findRecord(productId), effectiveCityIds);
  assertImageQaTransition(record.product, { imageDataUrl: newImage });
  return repository.commit(productId, { imageDataUrl: newImage });
}
