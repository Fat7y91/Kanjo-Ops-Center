import "server-only";

import { isMissingSchemaObject } from "./repository";
import type { CityTeam } from "./types";
import { isTeamDatabaseConfigured, listTeamRows } from "./team-repository";

/**
 * Field-team catalogue.
 *
 * Teams live in `app.field_teams` and are owned by one city each, so this is a
 * plain read of the database — there is no seed roster fallback. Without a
 * database the list is empty, which means "no team can be picked yet" rather
 * than "use demo teams": a team is only meaningful once it exists in a city.
 *
 * Callers are expected to narrow the result to the cities the viewer manages;
 * this function returns the whole catalogue.
 *
 * A deployment whose code ships ahead of `20261031000003_city_teams_and_contracting.sql`
 * has no `app.field_teams` table. That must not tear down the permissions page
 * (it previously surfaced as an uncaught `42P01` during the Server Component
 * render), so a missing table is treated as "no teams yet" and the dialog
 * simply offers to create the first one.
 */
export async function listTeams(): Promise<CityTeam[]> {
  if (!isTeamDatabaseConfigured()) return [];

  try {
    const rows = await listTeamRows();
    return rows.map((row) => ({
      id: row.id,
      cityId: row.city_id,
      name: row.name,
    }));
  } catch (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
}
