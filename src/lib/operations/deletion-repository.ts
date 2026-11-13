import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Tombstone writes for order deletion.
 *
 * Separated from the read repository so the order log stays a pure append-only
 * read surface. The operation row and its ledgers are never touched; these
 * records only hide an id from the working lists.
 */

const READ_TIMEOUT_MS = 6_000;
const WRITE_TIMEOUT_MS = 8_000;

/**
 * Operations the operator asked to remove from the working screen.
 *
 * The log itself is append-only, so a delete records the id in a tombstone
 * table instead of removing the row and its financial ledgers. Lists filter the
 * tombstones out, which keeps the audit trail and the balances intact.
 */
export async function deletedOperationIds(): Promise<Set<string>> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_log_deletions")
    .select("operation_id")
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error) {
    // `42501` is the rollout window before the table grant lands: treat it as
    // "no tombstones yet" so the orders board still renders instead of going
    // blank while the migration is being applied.
    if (isMissingSchemaObject(error)) return new Set();
    if ((error as { code?: unknown }).code === "42501") return new Set();
    throw error;
  }
  return new Set(
    ((data ?? []) as { operation_id: string }[]).map((row) => row.operation_id),
  );
}

export async function hideOperations(
  ids: readonly string[],
  deletedBy: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_log_deletions")
    .upsert(
      ids.map((operationId) => ({
        operation_id: operationId,
        deleted_by: deletedBy,
      })),
      { onConflict: "operation_id", ignoreDuplicates: true },
    )
    .select("operation_id")
    .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));

  if (error) throw error;
  return ((data ?? []) as { operation_id: string }[]).length;
}
