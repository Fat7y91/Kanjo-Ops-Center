import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Tier 4 repository for `app.field_teams`.
 *
 * A team is owned by exactly one city (see
 * `20261031000003_city_teams_and_contracting.sql`). There is deliberately no
 * global team list: every read can be narrowed to a city, because a team in
 * Cairo is not a valid choice for a rep in Desouk.
 */

export type TeamRow = {
  id: string;
  city_id: string;
  name: string;
  created_at: string;
};

const TEAM_COLUMNS = "id,city_id,name,created_at";

export function isTeamDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/** All teams, ordered by city then name. */
export async function listTeamRows(cityId?: string): Promise<TeamRow[]> {
  if (!hasSupabaseConfig()) return [];

  const client = getSupabaseServerClient();
  const base = client
    .schema("app")
    .from("field_teams")
    .select(TEAM_COLUMNS);
  const scoped = cityId ? base.eq("city_id", cityId) : base;
  const { data, error } = await scoped
    .order("city_id", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TeamRow[];
}

export async function findTeamRow(id: string): Promise<TeamRow | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("field_teams")
    .select(TEAM_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as TeamRow | null) ?? null;
}

export async function insertTeamRow(
  cityId: string,
  name: string,
): Promise<TeamRow> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("field_teams")
    .insert({ city_id: cityId, name })
    .select(TEAM_COLUMNS)
    .single();

  if (error) throw error;
  return data as TeamRow;
}
