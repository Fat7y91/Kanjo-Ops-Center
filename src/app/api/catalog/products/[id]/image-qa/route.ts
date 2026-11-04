import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { commitImageQa, findCatalogRecord } from "@/lib/catalog/repository";
import { ImageQaError } from "@/lib/catalog/services/image-qa-service";
import { effectiveCityIds } from "@/lib/city-scope-query";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const APPROVE_CAPABILITIES = [
  "edit_catalog",
  "review_image_quality",
] as const;

/** Replacing image content additionally accepts the image-editor grant. */
const ENHANCE_CAPABILITIES = [
  ...APPROVE_CAPABILITIES,
  "edit_product_images",
] as const;

const imageQaSchema = z.object({
  /** Data URL of the enhanced image; omitted when approving as-is. */
  imageDataUrl: z.string().max(3_000_000).nullable().optional(),
  reviewNote: z.string().trim().max(500).optional(),
});

/**
 * Image QA transition endpoint (Tier 2 controller).
 *
 * Authorization, payload validation and HTTP shaping only. The city-scope check
 * and the state machine come from the Tier 3 service, and the write goes
 * through the Tier 4 repository.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorizeAny(ENHANCE_CAPABILITIES);
  if (!session) return response;

  try {
    const { id } = await context.params;
    const patch = imageQaSchema.parse(await readJson(request));

    // Approving and replacing are separate capabilities. The union gate above
    // admits either operator; this check rejects the cross-case: an
    // image-editor cannot approve, and a reviewer cannot overwrite the image.
    const required =
      patch.imageDataUrl !== undefined
        ? ENHANCE_CAPABILITIES
        : APPROVE_CAPABILITIES;
    const allowed = required.some((permission) =>
      session.permissions.includes(permission),
    );
    if (!allowed) {
      throw new ImageQaError(
        "IMAGE_QA_FORBIDDEN",
        "لا تملك الصلاحية المطلوبة لهذا الإجراء.",
        403,
      );
    }

    const record = await findCatalogRecord(id);
    const cityScope = await effectiveCityIds(session);
    if (
      !record ||
      record.cityId === null ||
      !cityScope.includes(record.cityId)
    ) {
      throw new ImageQaError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
    }

    const { product, revision } = await commitImageQa(id, patch);

    return NextResponse.json(
      { product, revision },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
