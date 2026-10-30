import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Error formatting and setup diagnostics for the founder bootstrap.
 *
 * GoTrue never surfaces the SQL error behind "Database error creating new
 * user", so a failing `auth.admin.createUser` is undiagnosable from the Admin
 * API alone. `readDiagnostics` reads `app.bootstrap_diagnostics()`, which
 * reports the auth-mirror trigger's owner, whether that owner bypasses RLS,
 * whether `app.users` forces RLS, and the current policy list.
 */

/** Flattens a PostgREST/GoTrue error into something readable in a response. */
export function describeError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
    status?: number;
  };
  return [
    e.code ? `[${e.code}]` : "",
    e.message ?? "",
    e.details ? `details: ${e.details}` : "",
    e.hint ? `hint: ${e.hint}` : "",
    e.status ? `http: ${e.status}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Best-effort: diagnostics must never mask the original failure, so every
 * problem reading them is returned as data rather than thrown.
 */
export async function readDiagnostics(
  client: SupabaseClient,
): Promise<Record<string, unknown> | null> {
  const [diagnostics, probe] = await Promise.all([
    callRpc(client, "bootstrap_diagnostics"),
    callRpc(client, "bootstrap_probe"),
  ]);

  return { ...diagnostics, probe };
}

async function callRpc(
  client: SupabaseClient,
  fn: string,
): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await client.schema("app").rpc(fn);
    if (error) return { diagnostics_error: `${fn}: ${describeError(error)}` };
    return (data as Record<string, unknown> | null) ?? {};
  } catch (error) {
    return { diagnostics_error: `${fn}: ${describeError(error)}` };
  }
}
