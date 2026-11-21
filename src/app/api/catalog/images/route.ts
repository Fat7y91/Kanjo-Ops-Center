import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { storeCatalogImage } from "@/lib/catalog/images/store";
import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { catalogImageUploadSchema } from "@/lib/schemas/catalog";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const IMAGE_CAPABILITIES = ["add_catalog", "edit_catalog"] as const;

/**
 * Manual photo upload.
 *
 * The browser posts the downscaled Base64 capture once; the server stores it as
 * a blob and returns the URL that the product (and its draft) should keep. This
 * keeps Base64 out of `catalog_products`, the offline queue payload and Excel.
 */
export async function POST(request: Request) {
  const { session, response } = await authorizeAny([...IMAGE_CAPABILITIES]);
  if (!session) return response;

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "خدمة الصور غير متصلة." },
      { status: 503 },
    );
  }

  try {
    const input = catalogImageUploadSchema.parse(await readJson(request));
    const stored = await storeCatalogImage(input.dataUrl, input.merchantId ?? null);
    return NextResponse.json(
      { id: stored.id, url: stored.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "IMAGE_TOO_LARGE") {
      return NextResponse.json(
        { error: "حجم الصورة كبير جداً. استخدم صورة أصغر." },
        { status: 413 },
      );
    }
    return apiError(error);
  }
}
