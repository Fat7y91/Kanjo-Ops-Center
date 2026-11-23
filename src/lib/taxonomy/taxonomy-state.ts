import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Persistent taxonomy revision.
 *
 * The in-memory store resets with every edge isolate, so a sync must bump a
 * database counter for the governance header to prove the upload was applied.
 * A missing table (code ahead of the migration) degrades to revision 1.
 */
export async function bumpTaxonomyRevision(): Promise<number> {
  if (!hasSupabaseConfig()) return 1;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("taxonomy_state")
    .select("revision")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return 1;
    throw error;
  }

  const next = Number((data as { revision?: number } | null)?.revision ?? 1) + 1;
  const { error: writeError } = await client
    .schema("app")
    .from("taxonomy_state")
    .upsert(
      { id: 1, revision: next, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

  if (writeError && !isMissingSchemaObject(writeError)) throw writeError;
  return next;
}
