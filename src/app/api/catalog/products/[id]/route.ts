import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { findCatalogRecord } from "@/lib/catalog/repository";
import { CatalogError, catalogRevision } from "@/lib/catalog/store";
import { updateProduct } from "@/lib/catalog/product-update";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { productUpdateSchema } from "@/lib/schemas/catalog";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const EDIT_CAPABILITIES = ["edit_catalog", "add_catalog"] as const;

/**
 * Manual correction endpoint for a catalog product.
 *
 * This is a full field update (name, price, barcode, category, image) so the
 * operator can repair an auto-imported row immediately after it lands.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorizeAny([...EDIT_CAPABILITIES]);
  if (!session) return response;

  try {
    const { id } = await context.params;
    const patch = productUpdateSchema.parse(await readJson(request));

    const record = await findCatalogRecord(id);
    const cityScope = await effectiveCityIds(session);
    if (
      !record ||
      record.cityId === null ||
      !cityScope.includes(record.cityId)
    ) {
      throw new CatalogError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
    }

    const product = await updateProduct(id, {
      ...patch,
      imageDataUrl: patch.imageDataUrl ?? null,
    });
    return NextResponse.json(
      { product, revision: catalogRevision() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
