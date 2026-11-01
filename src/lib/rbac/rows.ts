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

export type TeamRefRow = {
  name: string | null;
};

export type UserRow = {
  id: string;
  email: string | null;
  full_name: string;
  title: string;
  team: string;
  team_id?: string | null;
  /**
   * Embedded `app.field_teams` row (many-to-one, so normally an object, but
   * PostgREST returns an array when it cannot infer cardinality).
   */
  field_teams?: TeamRefRow | TeamRefRow[] | null;
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

/**
 * Canonical projection: the profile row plus the owning team's display name.
 *
 * `field_teams` is embedded through the `team_id` foreign key, which is the
 * equivalent of `left join app.field_teams on field_teams.id = users.team_id`:
 * an operator without a team still comes back, with a null embed.
 */
export const USER_COLUMNS =
  "id,email,full_name,title,team,team_id,field_teams!team_id(name),clearance_level,global_scope,active,updated_at";

/** Projection when the relationship is unavailable but `team_id` exists. */
export const USER_COLUMNS_NO_TEAM_REF =
  "id,email,full_name,title,team,team_id,clearance_level,global_scope,active,updated_at";

/** Projection that predates `app.users.team_id`. */
export const USER_COLUMNS_LEGACY =
  "id,email,full_name,title,team,clearance_level,global_scope,active,updated_at";

/* Shared PostgREST error triage; the canonical implementation lives beside the
 * Supabase client so every repository reads the same codes from one place. */
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";

export { isMissingSchemaObject };

/**
 * True when the embedded team relation cannot be resolved.
 *
 * `PGRST200` means PostgREST has no relationship between `app.users` and
 * `app.field_teams` in its schema cache, and `PGRST201` means it cannot pick
 * one unambiguously. Both are the same deployment-ordering problem as a missing
 * table: the page must still render.
 */
function isMissingTeamEmbed(error: unknown): boolean {
  if (isMissingSchemaObject(error)) return true;
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === "PGRST200" || code === "PGRST201";
}

/**
 * Name of the owning `app.field_teams` row, or null when the operator has no
 * team or the embed is unavailable.
 */
function joinedTeamName(row: UserRow): string | null {
  const embed = row.field_teams;
  const value = Array.isArray(embed) ? embed[0]?.name : embed?.name;
  return value && value.trim() !== "" ? value : null;
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
    // Legacy free-text label. It stays the comparison key for merchant
    // ownership, which speaks the old vocabulary; `teamName` is the current
    // city-owned team's display name.
    team: row.team ?? "",
    teamName: joinedTeamName(row),
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
 * Reads profile rows with the owning team's name, degrading the projection in
 * three steps when the schema lags the code:
 *
 *   1. profile + embedded `field_teams` (the normal `left join`);
 *   2. profile + `team_id`, when the relation or table is missing;
 *   3. legacy profile without `team_id`, when the column is missing.
 *
 * Each step is only taken for a "missing schema object" error; every other
 * error is returned untouched so callers keep their existing failure behaviour.
 */
export async function selectUserRows(
  client: SupabaseClient,
  id?: string,
): Promise<{ rows: UserRow[]; error: unknown }> {
  const run = async (columns: string) => {
    const base = client.schema("app").from("users").select(columns);
    return id ? base.eq("id", id) : base;
  };

  const read = async (columns: string) => {
    const { data, error } = await run(columns);
    return { rows: (data ?? []) as unknown as UserRow[], error };
  };

  const primary = await read(USER_COLUMNS);
  if (!primary.error) return primary;
  if (!isMissingTeamEmbed(primary.error)) return primary;

  const withoutEmbed = await read(USER_COLUMNS_NO_TEAM_REF);
  if (!withoutEmbed.error) return withoutEmbed;
  if (!isMissingSchemaObject(withoutEmbed.error)) return withoutEmbed;

  return read(USER_COLUMNS_LEGACY);
}
