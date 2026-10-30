import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { isPermission, type Permission } from "./permissions";
import type { AppUser } from "./types";

/**
 * Tier 4 read/write repository for the RBAC domain.
 *
 * Source of truth is the `app` schema in Supabase (see ARCHITECTURE §7). This
 * module is the only place that knows the table shapes; callers keep using the
 * `AppUser` domain type.
 *
 * Every read returns `null`/`[]` when Supabase is not configured, and
 * `users.ts` falls back to the seed roster in that case. That keeps local dev
 * and builds working without credentials without ever silently mixing the two
 * sources: if Supabase *is* configured, the seed is not consulted.
 */

type UserRow = {
  id: string;
  email: string | null;
  full_name: string;
  title: string;
  team: string;
  clearance_level: number;
  global_scope: boolean;
  active: boolean;
  updated_at: string;
};

type GrantRow = {
  user_id: string;
  permission_key: string;
  granted_at: string;
};

type ScopeRow = {
  user_id: string;
  city_id: string;
  granted_at: string;
};

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

const USER_COLUMNS =
  "id,email,full_name,title,team,clearance_level,global_scope,active,updated_at";

export function isRbacDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function epochSeconds(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

function toAppUser(
  row: UserRow,
  permissions: Permission[],
  accessibleCities: string[],
): AppUser {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email ?? "",
    title: row.title,
    team: row.team,
    permissions,
    accessibleCities,
    clearanceLevel: row.clearance_level,
    globalScope: row.global_scope,
    active: row.active,
    updatedAt: row.updated_at,
  };
}

/**
 * Loads the whole operator set in three queries and joins in memory. The
 * operator catalogue is tens of rows, not thousands, so avoiding per-user
 * queries matters far more than avoiding the in-memory join.
 */
export async function loadRbacSnapshot(): Promise<RbacSnapshot | null> {
  if (!hasSupabaseConfig()) return null;

  const client = getSupabaseServerClient();

  const [usersResult, grantsResult, scopesResult] = await Promise.all([
    client.schema("app").from("users").select(USER_COLUMNS),
    client.schema("app").from("user_permissions").select("user_id,permission_key,granted_at"),
    client.schema("app").from("user_city_scope").select("user_id,city_id,granted_at"),
  ]);

  if (usersResult.error) throw usersResult.error;
  if (grantsResult.error) throw grantsResult.error;
  if (scopesResult.error) throw scopesResult.error;

  const grants = (grantsResult.data ?? []) as GrantRow[];
  const scopes = (scopesResult.data ?? []) as ScopeRow[];
  const rows = (usersResult.data ?? []) as UserRow[];

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

export async function listUserProfiles(): Promise<AppUser[] | null> {
  const snapshot = await loadRbacSnapshot();
  return snapshot ? snapshot.users : null;
}

export async function getUserProfile(id: string): Promise<AppUser | null> {
  if (!hasSupabaseConfig()) return null;

  const client = getSupabaseServerClient();

  const [userResult, grantsResult, scopesResult] = await Promise.all([
    client.schema("app").from("users").select(USER_COLUMNS).eq("id", id).maybeSingle(),
    client.schema("app").from("user_permissions").select("permission_key").eq("user_id", id),
    client.schema("app").from("user_city_scope").select("city_id").eq("user_id", id),
  ]);

  if (userResult.error) throw userResult.error;
  if (!userResult.data) return null;
  if (grantsResult.error) throw grantsResult.error;
  if (scopesResult.error) throw scopesResult.error;

  const permissions = (grantsResult.data ?? [])
    .map((row) => (row as { permission_key: string }).permission_key)
    .filter(isPermission);

  const cities = (scopesResult.data ?? []).map(
    (row) => (row as { city_id: string }).city_id,
  );

  return toAppUser(userResult.data as UserRow, permissions, cities);
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
    const { error: clearError } = await client
      .schema("app")
      .from("user_permissions")
      .delete()
      .eq("user_id", id);
    if (clearError) throw clearError;

    if (patch.permissions.length > 0) {
      const { error } = await client
        .schema("app")
        .from("user_permissions")
        .insert(
          patch.permissions.map((permissionKey) => ({
            user_id: id,
            permission_key: permissionKey,
          })),
        );
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
