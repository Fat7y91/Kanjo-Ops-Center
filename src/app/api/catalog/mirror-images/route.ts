import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { findCatalogRecord } from "@/lib/catalog/repository";
import { mirrorProductImage } from "@/lib/catalog/images/mirror";
import { bumpRevision } from "@/lib/catalog/store";
import type { MirrorItemResult } from "@/lib/catalog/mirror-payload";
import { catalogMirrorImagesSchema } from "@/lib/schemas/catalog";
import { effectiveCityIds } from "@/lib/city-scope-query";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const MIRROR_CAPABILITIES = ["add_catalog", "edit_catalog"] as const;

/**
 * Copies a small batch of product photos onto the server.
 *
 * Each product is handled independently so a dead marketplace CDN cannot abort
 * the batch. The merchant and city scope are re-checked per row: the ids come
 * from the client, so the endpoint must not let them widen visibility.
 */
export async function POST(request: Request) {
  const { session, response } = await authorizeAny([...MIRROR_CAPABILITIES]);
  if (!session) return response;

  try {
    const input = catalogMirrorImagesSchema.parse(await readJson(request));
    const allowed = new Set(await effectiveCityIds(session));
    const results: MirrorItemResult[] = [];
    let mirrored = 0;

    for (const id of input.productIds) {
      const record = await findCatalogRecord(id);
      if (
        !record ||
        record.cityId === null ||
        !allowed.has(record.cityId) ||
        record.product.merchantId !== input.merchantId
      ) {
        results.push({
          id,
          name: "",
          status: "failed",
          reason: "المنتج غير موجود أو خارج نطاق صلاحيتك.",
        });
        continue;
      }

      try {
        const result = await mirrorProductImage(record.product);
        if (result.status === "mirrored") mirrored += 1;
        results.push(result);
      } catch (error) {
        results.push({
          id,
          name: record.product.name,
          status: "failed",
          reason:
            error instanceof Error
              ? error.message
              : "تعذر توطين الصورة.",
        });
      }
    }

    if (mirrored > 0) bumpRevision();

    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
