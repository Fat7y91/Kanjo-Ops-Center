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

/**
 * Pure transition function for the Image QA workflow.
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
  if (!product) {
    throw new ImageQaError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
  }
  if (product.state !== "pending_review") {
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
    product.imageDataUrl = nextImage;
  }

  product.state = "completed";
  product.reviewNote = patch.reviewNote?.trim() || "اكتملت مراجعة الصورة";
  product.updatedAt = now;
  return product;
}
