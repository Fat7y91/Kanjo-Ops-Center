"use server";

import { revalidatePath } from "next/cache";

import { getServerSession } from "@/lib/auth/server-session";
import {
  commitImageQa,
  findCatalogRecord,
  listCatalogRecords,
  type ImageQaCommitPatch,
} from "@/lib/catalog/repository";
import {
  ImageQaError,
  approveImage,
  uploadEnhancedImage,
  type ImageQaRepository,
} from "@/lib/catalog/services/image-qa-service";
import { effectiveCityIds } from "@/lib/city-scope-query";
import type { CatalogProduct } from "@/lib/catalog/types";
import type { Permission } from "@/lib/rbac/permissions";

/**
 * Image QA controller (Tier 2).
 *
 * Owns authorization, payload shape and cache revalidation. Every business
 * rule is delegated to `services/image-qa-service.ts`; persistence is delegated
 * to `catalog/repository.ts`.
 */

/**
 * Approving the current image needs a review capability. `edit_catalog` is the
 * broader grant that has always implied it, and `review_image_quality` is the
 * dedicated key the nav module opens on.
 */
const APPROVE_CAPABILITIES: readonly Permission[] = [
  "edit_catalog",
  "review_image_quality",
];

/**
 * Replacing the image is editing image content, so `edit_product_images` is
 * sufficient on its own — that is the second capability the QA module opens on.
 */
const ENHANCE_CAPABILITIES: readonly Permission[] = [
  "edit_catalog",
  "review_image_quality",
  "edit_product_images",
];

export type ImageQaActionResult = {
  ok: boolean;
  product?: CatalogProduct;
  error?: string;
};

/** Server-only hard gate: no session or no capability means no QA action. */
async function requireCapability(capabilities: readonly Permission[]) {
  const session = await getServerSession();
  if (!session) {
    return { session: null, error: "انتهت الجلسة. سجّل الدخول مجدداً." };
  }
  const allowed = capabilities.some((permission) =>
    session.permissions.includes(permission),
  );
  if (!allowed) {
    return {
      session: null,
      error: "لا تملك صلاحية مراجعة صور الكتالوج.",
    };
  }
  return { session, error: null };
}

const repository: ImageQaRepository = {
  listRecords: listCatalogRecords,
  findRecord: findCatalogRecord,
  commit: (productId: string, patch: ImageQaCommitPatch) =>
    commitImageQa(productId, patch),
};

async function toResult(
  resolve: () => Promise<{ product: CatalogProduct }>,
): Promise<ImageQaActionResult> {
  try {
    const { product } = await resolve();
    revalidatePath("/catalog");
    revalidatePath("/catalog/qa");
    return { ok: true, product };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ImageQaError
          ? error.message
          : "تعذر إكمال مراجعة الصورة.",
    };
  }
}

/** Approves the current image and moves the product to `completed`. */
export async function approveProductImage(
  productId: string,
): Promise<ImageQaActionResult> {
  const { session, error } = await requireCapability(APPROVE_CAPABILITIES);
  if (!session) return { ok: false, error: error ?? undefined };

  return toResult(() =>
    approveImage(repository, productId, effectiveCityIds(session)),
  );
}

/** Replaces the image with an enhanced version and completes the review. */
export async function uploadEnhancedProductImage(
  productId: string,
  imageDataUrl: string,
): Promise<ImageQaActionResult> {
  const { session, error } = await requireCapability(ENHANCE_CAPABILITIES);
  if (!session) return { ok: false, error: error ?? undefined };

  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return { ok: false, error: "ملف الصورة غير صالح." };
  }

  return toResult(() =>
    uploadEnhancedImage(
      repository,
      productId,
      imageDataUrl,
      effectiveCityIds(session),
    ),
  );
}
