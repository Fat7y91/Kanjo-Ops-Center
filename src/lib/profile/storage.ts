import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Supabase Storage access for profile avatars and capital receipts.
 *
 * Both buckets are created by the migration only when the storage schema
 * exists, so these helpers check configuration rather than the bucket itself.
 */

export type UploadTarget = "avatars" | "capital-receipts";

/**
 * Uploads a file to a Supabase Storage bucket and returns its public URL for
 * avatars or its object path for receipts.
 *
 * Receipts are private, so the caller stores the path and the read path mints a
 * short-lived signed URL. Avatars are public and addressed directly.
 */
export async function uploadObject(
  bucket: UploadTarget,
  path: string,
  file: Blob,
  contentType: string,
): Promise<string> {
  const client = getSupabaseServerClient();
  const { error } = await client.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });

  if (error) throw error;

  if (bucket === "avatars") {
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
  return path;
}

/** Short-lived download URL for a private receipt. */
export async function signedReceiptUrl(
  path: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client.storage
    .from("capital-receipts")
    .createSignedUrl(path, expiresInSeconds);

  return error || !data ? null : data.signedUrl;
}
