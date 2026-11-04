import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { toOperator, type OperatorDocument } from "./documents";
import { isPermission, type Permission } from "./permissions";
import {
  isMissingSchemaObject,
  selectUserRows,
  toAppUser,
  type GrantRow,
  type ScopeRow,
  type UserRow,
} from "./rows";
import type { AppUser } from "./types";

export { isMissingSchemaObject };

/**
 * Tier 4 read/write repository for the RBAC domain.
 *
 * Source of truth is the `app` schema in Supabase (see ARCHITECTURE §7). This
 * module is the only place that knows the table shapes; callers keep using the
 * `AppUser` domain type. Row shapes and the schema-drift projections live in
 * `rows.ts`.
 *
 * Every read returns `null`/`[]` when Supabase is not configured, and
 * `users.ts` falls back to the seed roster in that case. That keeps local dev
 * and builds working without credentials without ever silently mixing the two
 * sources: if Supabase *is* configured, the seed is not consulted.
 */

export type RbacSnapshot = {
  users: AppUser[];
  revision: number;
};

export type UserPatchInput = {
  permissions?: readonly Permission[];
  clearanceLevel?: number;
  accessibleCities?: readonly string[];
  active?: boolean;
};

export function isRbacDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function epochSeconds(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

/**
 * Pre-migration path for the whole roster.
 *
 * `listUserProfiles()` prefers `app.rbac_user_directory()`; this three-query
 * snapshot is what answers when that function is not deployed yet. It stays
 * because a code deploy that lands ahead of its migration must still render —
 * slower by design, never wrong by accident.
 *
 * The operator catalogue is tens of rows, not thousands, so avoiding per-user
 * queries matters far more than avoiding the in-memory join.
 */
export async function loadRbacSnapshot(): Promise<RbacSnapshot | null> {
  if (!hasSupabaseConfig()) return null;

  const client = getSupabaseServerClient();

  const [userRows, grantsResult, scopesResult] = await Promise.all([
    selectUserRows(client),
    client.schema("app").from("user_permissions").select("user_id,permission_key,granted_at"),
    client.schema("app").from("user_city_scope").select("user_id,city_id,granted_at"),
  ]);

  if (userRows.error) throw userRows.error;
  // Grants and scope are additive tables: while a migration is in flight
  // PostgREST may not see them yet. A missing schema object degrades to "no
  // grants / no scope" for the render; every other error keeps failing loudly.
  if (grantsResult.error && !isMissingSchemaObject(grantsResult.error)) {
    throw grantsResult.error;
  }
  if (scopesResult.error && !isMissingSchemaObject(scopesResult.error)) {
    throw scopesResult.error;
  }

  const grants = grantsResult.error ? [] : ((grantsResult.data ?? []) as GrantRow[]);
  const scopes = scopesResult.error ? [] : ((scopesResult.data ?? []) as ScopeRow[]);
  const rows = userRows.rows;

  const permissionsByUser = new Map<string, Permission[]>();
  for (const grant of grants) {
    if (!isPermission(grant.permission_key)) continue;
    const bucket = permissionsByUser.get(grant.user_id) ?? [];
    bucket.push(grant.permission_key);
    permissionsByUser.set(grant.user_id, bucket);
  }

  const citiesByUser = new Map<string, string[]>();
  for (const scope of scopes) {
    const bucket = citiesByUser.get(scope.user_id) ?? [];
    bucket.push(scope.city_id);
    citiesByUser.set(scope.user_id, bucket);
  }

  const users = rows
    .map((row) =>
      toAppUser(
        row,
        permissionsByUser.get(row.id) ?? [],
        citiesByUser.get(row.id) ?? [],
      ),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  // Revision is the newest mutation timestamp across profiles, grants and
  // scopes. Any authorization change therefore invalidates live sessions.
  const revision = [
    ...rows.map((row) => epochSeconds(row.updated_at)),
    ...grants.map((grant) => epochSeconds(grant.granted_at)),
    ...scopes.map((scope) => epochSeconds(scope.granted_at)),
  ].reduce((max, value) => (value > max ? value : max), 0);

  return { users, revision };
}

/**
 * Whole operator directory: the roster, its grants and its city scope.
 *
 * `app.rbac_user_directory()` (see
 * `20261108000000_rbac_user_directory.sql`) aggregates the same documents
 * `app.rbac_session(uuid)` returns per operator, so the join and the per-user
 * permission filtering happen in one statement instead of three queries plus a
 * Worker-side merge — the difference between one read and six on the admin
 * matrix, the assignable-manager picker and the governor invariant check.
 *
 * A deployment whose code runs ahead of that migration keeps working: a missing
 * function is treated exactly like a missing table and the three-query snapshot
 * answers instead. Every other error keeps failing loudly, so a broken database
 * is never mistaken for a missing migration.
 */
export async function listUserProfiles(): Promise<AppUser[] | null> {
  if (!hasSupabaseConfig()) return null;

  const { data, error } = await getSupabaseServerClient()
    .schema("app")
    .rpc("rbac_user_directory");

  if (error) {
    if (!isMissingSchemaObject(error)) throw error;
    const snapshot = await loadRbacSnapshot();
    return snapshot ? snapshot.users : null;
  }

  return ((data ?? []) as OperatorDocument[]).map(toOperator);
}

export async function getUserProfile(id: string): Promise<AppUser | null> {
  if (!hasSupabaseConfig()) return null;

  const client = getSupabaseServerClient();

  const [userResult, grantsResult, scopesResult] = await Promise.all([
    selectUserRows(client, id),
    client.schema("app").from("user_permissions").select("permission_key").eq("user_id", id),
    client.schema("app").from("user_city_scope").select("city_id").eq("user_id", id),
  ]);

  if (userResult.error) throw userResult.error;
  if (userResult.rows.length === 0) return null;
  if (grantsResult.error && !isMissingSchemaObject(grantsResult.error)) {
    throw grantsResult.error;
  }
  if (scopesResult.error && !isMissingSchemaObject(scopesResult.error)) {
    throw scopesResult.error;
  }

  const permissions = grantsResult.error
    ? []
    : (grantsResult.data ?? [])
        .map((row) => (row as { permission_key: string }).permission_key)
        .filter(isPermission);

  const cities = scopesResult.error
    ? []
    : (scopesResult.data ?? []).map(
        (row) => (row as { city_id: string }).city_id,
      );

  return toAppUser(userResult.rows[0], permissions, cities);
}

export async function getRbacRevision(): Promise<number> {
  const snapshot = await loadRbacSnapshot();
  return snapshot ? snapshot.revision : 0;
}

/** Rewrites the profile row, then the grant and scope membership. */
export async function updateUserProfile(
  id: string,
  patch: UserPatchInput,
): Promise<void> {
  const client = getSupabaseServerClient();

  if (patch.clearanceLevel !== undefined || patch.active !== undefined) {
    const profile: Record<string, unknown> = {};
    if (patch.clearanceLevel !== undefined) {
      profile.clearance_level = patch.clearanceLevel;
    }
    if (patch.active !== undefined) profile.active = patch.active;

    const { error } = await client
      .schema("app")
      .from("users")
      .update(profile)
      .eq("id", id);
    if (error) throw error;
  }

  if (patch.permissions !== undefined) {
    // Diff, never truncate-and-reinsert. `manage_system_users` is protected by a
    // deferred constraint trigger (`assert_governor_remaining`), so deleting the
    // sole governor's grant and re-adding it in a second statement would abort
    // the transaction at commit. Additions first, removals second: the invariant
    // is only ever observed on a full set.
    const { data: current, error: readError } = await client
      .schema("app")
      .from("user_permissions")
      .select("permission_key")
      .eq("user_id", id);
    if (readError) throw readError;

    const held = new Set(
      (current ?? []).map(
        (row) => (row as { permission_key: string }).permission_key,
      ),
    );
    const next = new Set<string>(patch.permissions);
    const added = [...next].filter((key) => !held.has(key));
    const removed = [...held].filter((key) => !next.has(key));

    if (added.length > 0) {
      const { error } = await client
        .schema("app")
        .from("user_permissions")
        .insert(
          added.map((permissionKey) => ({
            user_id: id,
            permission_key: permissionKey,
          })),
        );
      if (error) throw error;
    }

    if (removed.length > 0) {
      const { error } = await client
        .schema("app")
        .from("user_permissions")
        .delete()
        .eq("user_id", id)
        .in("permission_key", removed);
      if (error) throw error;
    }
  }

  if (patch.accessibleCities !== undefined) {
    const { error: clearError } = await client
      .schema("app")
      .from("user_city_scope")
      .delete()
      .eq("user_id", id);
    if (clearError) throw clearError;

    if (patch.accessibleCities.length > 0) {
      const { error } = await client
        .schema("app")
        .from("user_city_scope")
        .insert(
          patch.accessibleCities.map((cityId) => ({
            user_id: id,
            city_id: cityId,
          })),
        );
      if (error) throw error;
    }
  }
}

export async function deleteUserProfile(id: string): Promise<void> {
  const client = getSupabaseServerClient();
  const { error } = await client.schema("app").from("users").delete().eq("id", id);
  if (error) throw error;
}
