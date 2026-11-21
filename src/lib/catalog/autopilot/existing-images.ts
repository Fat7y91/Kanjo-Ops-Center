import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

export type ResumedProduct = { categoryKey: string | null };

/**
 * Barcode → existing product category for rows that already carry an image.
 * The autopilot uses this to resume without spending DeepSeek/Serper credits.
 */
export async function existingImagesByBarcode(
  merchantId: string,
  barcodes: string[],
): Promise<Map<string, ResumedProduct>> {
  const wanted = [...new Set(barcodes.filter(Boolean))];
  const result = new Map<string, ResumedProduct>();
  if (wanted.length === 0 || !hasSupabaseConfig()) return result;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("catalog_products")
    .select("barcode,image_data_url,category_key")
    .eq("merchant_id", merchantId)
    .in("barcode", wanted);

  if (error) {
    if (!isMissingSchemaObject(error)) {
      console.error("[autopilot] resume lookup failed", error);
    }
    return result;
  }

  for (const row of (data ?? []) as {
    barcode: string | null;
    image_data_url: string | null;
    category_key: string | null;
  }[]) {
    if (!row.barcode || !row.image_data_url?.trim()) continue;
    result.set(row.barcode, { categoryKey: row.category_key });
  }
  return result;
}
