import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Hard deletion for order rows.
 *
 * The PO rejected tombstones because re-importing a corrected CSV hit the
 * `order_id` unique constraint while the old row still existed. A delete now
 * removes the operation itself; the database trigger removes its journal entry
 * in the same transaction so the books carry no orphaned posting.
 */

const WRITE_TIMEOUT_MS = 8_000;

export async function hardDeleteOperations(
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_logs")
    .delete()
    .in("id", [...ids])
    .select("id")
    .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));

  if (error) throw error;
  return ((data ?? []) as { id: string }[]).length;
}
