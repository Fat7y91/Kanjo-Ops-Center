import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Permission } from "./permissions";
import type { AppUser } from "./types";

/**
 * Row shapes and projections for the RBAC repository.
 *
 * Kept apart from the query/write logic so the schema-drift handling has one
 * home: `app.users.team_id` ships with
 * `20261031000003_city_teams_and_contracting.sql`, and a deployment whose code
 * runs ahead of its migrations must keep rendering rather than throw inside a
 * Server Component (which surfaced as an HTTP 500).
 */

export type UserRow = {
  id: string;
  email: string | null;
  full_name: string;
  title: string;
  team: string;
  team_id?: string | null;
  clearance_level: number;
  global_scope: boolean;
  active: boolean;
  updated_at: string;
};

export type GrantRow = {
  user_id: string;
  permission_key: string;
  granted_at: string;
};

export type ScopeRow = {
  user_id: string;
  city_id: string;
  granted_at: string;
};

export const USER_COLUMNS =
  "id,email,full_name,title,team,team_id,clearance_level,global_scope,active,updated_at";

/** Projection that predates `app.users.team_id`. */
export const USER_COLUMNS_LEGACY =
  "id,email,full_name,title,team,clearance_level,global_scope,active,updated_at";

/**
 * True when PostgREST reports that a column, table or function is absent.
 *
 * `42703` is an undefined column, `42P01` an undefined table, and `PGRST202` /
 * `PGRST204` mean the schema cache has not picked up a newly added object yet.
 * All are deployment-ordering problems, not data corruption, so reads degrade
 * instead of throwing.
 */
export function isMissingSchemaObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === "42703" ||
    code === "42P01" ||
    code === "PGRST202" ||
    code === "PGRST204"
  );
}

export function toAppUser(
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
    // Absent when the deployment is reading the legacy projection.
    teamId: row.team_id ?? null,
    permissions,
    accessibleCities,
    clearanceLevel: row.clearance_level,
    globalScope: row.global_scope,
    active: row.active,
    updatedAt: row.updated_at,
  };
}

/**
 * Reads profile rows, retrying without `team_id` when the column is absent.
 *
 * Only a missing schema object selects the legacy projection; every other error
 * is returned untouched so callers keep their existing failure behaviour.
 */
export async function selectUserRows(
  client: SupabaseClient,
  id?: string,
): Promise<{ rows: UserRow[]; error: unknown }> {
  const query = (columns: string) => {
    const base = client.schema("app").from("users").select(columns);
    return id ? base.eq("id", id) : base;
  };

  const primary = await query(USER_COLUMNS);
  if (!primary.error) {
    return { rows: (primary.data ?? []) as unknown as UserRow[], error: null };
  }

  if (!isMissingSchemaObject(primary.error)) {
    return { rows: [], error: primary.error };
  }

  const legacy = await query(USER_COLUMNS_LEGACY);
  if (legacy.error) return { rows: [], error: legacy.error };
  return { rows: (legacy.data ?? []) as unknown as UserRow[], error: null };
}
