import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { GovernanceError, fromDatabaseError } from "@/lib/governance/errors";

/**
 * Shared plumbing for the notification reads (`repository.ts`) and writes
 * (`mutations.ts`): the client guard, the deadline, the uuid shape and the two
 * error translations. Nothing here touches a table.
 */

export const READ_TIMEOUT_MS = 6_000;

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isNotificationsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

export function storeUnavailable(): GovernanceError {
  return new GovernanceError(
    "STORE_UNAVAILABLE",
    "تعذر الوصول إلى صندوق الإشعارات.",
    503,
  );
}

/** SQL trigger codes and RLS denials become domain errors; anything else passes through. */
export function rethrow(error: unknown): never {
  const mapped = fromDatabaseError(error);
  throw mapped ?? error;
}
