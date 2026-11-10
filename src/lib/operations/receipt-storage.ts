import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Supabase Storage access for transaction receipts.
 *
 * The `transaction-receipts` bucket is private (created by migration only when
 * the storage schema exists). Files are uploaded by the server after admission
 * checks and read through a short-lived signed URL, so a receipt is visible
 * wherever its journal entry is without a permanent public link.
 */

export const TRANSACTION_RECEIPTS_BUCKET = "transaction-receipts";

export async function uploadTransactionReceipt(
  path: string,
  file: Blob,
  contentType: string,
): Promise<string> {
  const client = getSupabaseServerClient();
  const { error } = await client.storage
    .from(TRANSACTION_RECEIPTS_BUCKET)
    .upload(path, file, { contentType, upsert: false });

  if (error) throw error;
  return path;
}

export async function signedTransactionReceiptUrl(
  path: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client.storage
    .from(TRANSACTION_RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  return error || !data ? null : data.signedUrl;
}

/**
 * Best-effort removal of an orphaned receipt.
 *
 * Used to roll back when a receipt uploaded but the settlement then failed:
 * without it every failed attempt would leave an unreferenced object in the
 * bucket. A cleanup failure must not mask the original error.
 */
export async function removeTransactionReceipt(path: string): Promise<void> {
  const client = getSupabaseServerClient();
  await client.storage.from(TRANSACTION_RECEIPTS_BUCKET).remove([path]);
}
