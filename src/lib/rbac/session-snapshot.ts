import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { isPermission } from "./permissions";
import { getUserProfile, loadRbacSnapshot } from "./repository";
import type { AppUser } from "./types";

/**
 * One-read session resolution.
 *
 * `app.rbac_session(uuid)` (see `20261107000000_rbac_session_read.sql`) returns
 * the profile, the capability keys, the city scope and the global revision as a
 * single jsonb document, so resolving a session costs one round trip instead of
 * six: three queries for the profile, then three more to rebuild the whole
 * permission graph in the Worker only to reduce it to a revision number.
 *
 * The same call serves `getUserById()`, so the per-user reads elsewhere — city
 * manager lists, the admin detail view — drop from three queries to one as
 * well.
 *
 * A deployment whose code runs ahead of that migration keeps working:
 * PostgREST reporting the function as absent is treated exactly like a missing
 * table, and `readLegacySnapshot()` is the previous query path. Every other
 * error keeps failing loudly, so a broken database is never mistaken for a
 * missing migration.
 */

/** The jsonb document `app.rbac_session(uuid)` returns. */
type SessionSnapshotRow = {
  user: {
    id: string;
    name: string;
    email: string | null;
    title: string;
    team: string | null;
    teamId: string | null;
    teamName: string | null;
    clearanceLevel: number;
    globalScope: boolean;
    active: boolean;
    updatedAt: string;
  };
  permissions: string[] | null;
  cities: string[] | null;
  revision: number | string | null;
};

export type RbacSessionSnapshot = {
  user: AppUser;
  /** Newest authorization mutation, unix seconds. Stamped into the session. */
  revision: number;
};

/**
 * Grant keys are filtered through the TypeScript catalogue, never trusted
 * as-is: a key the application does not know is not a capability it can check,
 * and `isPermission` is the single definition of that contract.
 */
function toAppUser(row: SessionSnapshotRow): AppUser {
  const profile = row.user;
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email ?? "",
    title: profile.title,
    team: profile.team ?? "",
    teamName: profile.teamName,
    teamId: profile.teamId,
    permissions: (row.permissions ?? []).filter(isPermission),
    accessibleCities: row.cities ?? [],
    clearanceLevel: profile.clearanceLevel,
    globalScope: profile.globalScope,
    active: profile.active,
    updatedAt: profile.updatedAt,
  };
}

/**
 * Previous query path, kept for a deployment that has not applied the session
 * migration yet. Slower by design (three queries plus a full snapshot read), but
 * it answers the same question and never invents data.
 */
async function readLegacySnapshot(
  userId: string,
): Promise<RbacSessionSnapshot | null> {
  const user = await getUserProfile(userId);
  if (!user) return null;

  const snapshot = await loadRbacSnapshot();
  return { user, revision: snapshot?.revision ?? 0 };
}

/**
 * Profile, capabilities, city scope and revision for one operator, or `null`
 * when the id has no profile row (a valid credential with no authorization row
 * is not an operator).
 */
export async function readSessionSnapshot(
  userId: string,
): Promise<RbacSessionSnapshot | null> {
  if (!hasSupabaseConfig()) return null;

  const { data, error } = await getSupabaseServerClient()
    .schema("app")
    .rpc("rbac_session", { p_user_id: userId });

  if (error) {
    if (isMissingSchemaObject(error)) return readLegacySnapshot(userId);
    throw error;
  }
  if (!data) return null;

  const row = data as SessionSnapshotRow;
  return { user: toAppUser(row), revision: Number(row.revision ?? 0) };
}

/**
 * The revision on its own.
 *
 * Uses the scalar function so a caller that only needs to detect "did
 * authorization change" does not pay for the graph that answers it.
 */
export async function readRbacRevision(): Promise<number> {
  if (!hasSupabaseConfig()) return 0;

  const { data, error } = await getSupabaseServerClient()
    .schema("app")
    .rpc("rbac_revision");

  if (error) {
    if (isMissingSchemaObject(error)) {
      const snapshot = await loadRbacSnapshot();
      return snapshot?.revision ?? 0;
    }
    throw error;
  }

  return Number(data ?? 0);
}
