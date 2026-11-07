import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { MERCHANT_ASSETS_BUCKET } from "@/lib/field-ops/merchant-asset-upload";

/**
 * Supabase Storage access for merchant logo and cover images.
 *
 * The bucket is public (the images render in the catalog), so an upload returns
 * the public URL that is stored on the merchant row. Replacing an image writes a
 * new object rather than overwriting, so a stale URL never points at new bytes.
 */
export async function uploadMerchantAsset(
  path: string,
  file: Blob,
  contentType: string,
): Promise<string> {
  const client = getSupabaseServerClient();
  const { error } = await client.storage
    .from(MERCHANT_ASSETS_BUCKET)
    .upload(path, file, { contentType, upsert: false });

  if (error) throw error;

  const { data } = client.storage.from(MERCHANT_ASSETS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Deletes an object that was uploaded but never referenced.
 *
 * Used to roll back when the follow-up merchant update fails: without it, every
 * failed attempt would leave an orphaned object in the bucket that no row points
 * at. Best-effort — a cleanup failure must not mask the original error.
 */
export async function removeMerchantAsset(path: string): Promise<void> {
  const client = getSupabaseServerClient();
  await client.storage.from(MERCHANT_ASSETS_BUCKET).remove([path]);
}
