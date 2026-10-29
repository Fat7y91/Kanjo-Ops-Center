import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { commitImageQa, findCatalogRecord } from "@/lib/catalog/repository";
import { ImageQaError } from "@/lib/catalog/services/image-qa-service";
import { effectiveCityIds } from "@/lib/city-scope-query";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const REVIEW_CAPABILITIES = [
  "manage_catalog",
  "review_catalog_images",
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
  const { session, response } = await authorizeAny([...REVIEW_CAPABILITIES]);
  if (!session) return response;

  try {
    const { id } = await context.params;
    const patch = imageQaSchema.parse(await readJson(request));

    const record = findCatalogRecord(id);
    const cityScope = effectiveCityIds(session);
    if (
      !record ||
      record.cityId === null ||
      !cityScope.includes(record.cityId)
    ) {
      throw new ImageQaError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
    }

    const { product, revision } = commitImageQa(id, patch);

    return NextResponse.json(
      { product, revision },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
