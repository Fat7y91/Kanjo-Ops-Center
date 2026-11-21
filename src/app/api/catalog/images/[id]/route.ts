import { NextResponse } from "next/server";

import {
  imageBytes,
  readCatalogImage,
} from "@/lib/catalog/images/store";
import { hasSupabaseConfig } from "@/lib/db/supabase/config";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

const NOT_FOUND = () =>
  NextResponse.json({ error: "الصورة غير موجودة." }, { status: 404 });

/**
 * Public bytes for a stored catalog photo.
 *
 * Image URLs are pasted into Excel exports and rendered outside the app, so
 * this route is intentionally unauthenticated: the id is a random/content hash
 * and grants nothing but the image itself.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) return NOT_FOUND();
  if (!hasSupabaseConfig()) return NOT_FOUND();

  let blob: Awaited<ReturnType<typeof readCatalogImage>>;
  try {
    blob = await readCatalogImage(id);
  } catch {
    return NextResponse.json(
      { error: "تعذر قراءة الصورة." },
      { status: 503 },
    );
  }
  if (!blob) return NOT_FOUND();

  const bytes = imageBytes(blob.dataUrl);
  if (!bytes) return NOT_FOUND();

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": blob.contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
