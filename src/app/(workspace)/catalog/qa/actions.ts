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

const REVIEW_CAPABILITIES: readonly Permission[] = [
  "manage_catalog",
  "review_catalog_images",
];

export type ImageQaActionResult = {
  ok: boolean;
  product?: CatalogProduct;
  error?: string;
};

/** Server-only hard gate: no session or no capability means no QA action. */
async function requireReviewer() {
  const session = await getServerSession();
  if (!session) {
    return { session: null, error: "انتهت الجلسة. سجّل الدخول مجدداً." };
  }
  const allowed = REVIEW_CAPABILITIES.some((permission) =>
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

function toResult(
  resolve: () => { product: CatalogProduct },
): ImageQaActionResult {
  try {
    const { product } = resolve();
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
  const { session, error } = await requireReviewer();
  if (!session) return { ok: false, error: error ?? undefined };

  return toResult(() =>
    approveImage(
      repository,
      productId,
      effectiveCityIds(session),
    ),
  );
}

/** Replaces the image with an enhanced version and completes the review. */
export async function uploadEnhancedProductImage(
  productId: string,
  imageDataUrl: string,
): Promise<ImageQaActionResult> {
  const { session, error } = await requireReviewer();
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
