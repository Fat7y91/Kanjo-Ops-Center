import "server-only";

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
 */
export async function listTeams(): Promise<CityTeam[]> {
  if (!isTeamDatabaseConfigured()) return [];

  const rows = await listTeamRows();
  return rows.map((row) => ({
    id: row.id,
    cityId: row.city_id,
    name: row.name,
  }));
}
