import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import {
  CatalogError,
  catalogRevision,
  completeImageQa,
  listProducts,
} from "@/lib/catalog/store";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { getMerchantById } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

const REVIEW_CAPABILITIES = ["manage_catalog", "edit_products"] as const;

const imageQaSchema = z.object({
  /** Data URL of the enhanced image; omitted when approving as-is. */
  imageDataUrl: z.string().max(3_000_000).nullable().optional(),
  reviewNote: z.string().trim().max(500).optional(),
});

/**
 * Image QA transition endpoint.
 *
 * Moves a `pending_review` product to `completed`, optionally replacing its
 * image. The store enforces the state machine so a stale client cannot complete
 * a product twice or skip review entirely.
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

    // Reviewers may only act on products inside their effective city scope.
    const allowed = new Set(effectiveCityIds(session));
    const product = listProducts().find((candidate) => candidate.id === id);
    const merchant = product ? getMerchantById(product.merchantId) : null;
    if (!product || !merchant || !allowed.has(merchant.cityId)) {
      throw new CatalogError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
    }

    const updated = completeImageQa(id, patch);
    return NextResponse.json(
      { product: updated, revision: catalogRevision() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
