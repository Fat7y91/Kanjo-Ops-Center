import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { findCatalogRecord } from "@/lib/catalog/repository";
import { CatalogError, catalogRevision } from "@/lib/catalog/store";
import { deleteProduct, updateProduct } from "@/lib/catalog/product-update";
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

/**
 * Deletes a catalog product.
 *
 * Gated by `delete_products`; the product's merchant city must fall inside the
 * viewer's city scope so a delete cannot cross a scope boundary.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorizeAny(["delete_products"]);
  if (!session) return response;

  try {
    const { id } = await context.params;

    const record = await findCatalogRecord(id);
    const cityScope = await effectiveCityIds(session);
    if (
      !record ||
      record.cityId === null ||
      !cityScope.includes(record.cityId)
    ) {
      throw new CatalogError("PRODUCT_NOT_FOUND", "المنتج غير موجود.", 404);
    }

    await deleteProduct(id);
    return NextResponse.json(
      { revision: catalogRevision() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
