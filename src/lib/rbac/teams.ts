import { TEAM_LABELS } from "@/lib/field-ops/types";
import { listUsers } from "@/lib/rbac/users";

/**
 * Known field teams.
 *
 * Mirrors the nav/ops vocabulary in `field-ops/types` so a courier is always
 * assigned to a real operating team. The roster can add new teams on the fly,
 * so the caller always merges this base list with the teams already in use.
 */
export const BASE_TEAMS = Object.keys(TEAM_LABELS);

export type TeamOption = { value: string; label: string };

function labelFor(team: string): string {
  return TEAM_LABELS[team] ?? team;
}

/**
 * Teams already in use plus the canonical base list, de-duplicated and labelled.
 *
 * Reads the operator roster because a team exists the moment someone belongs to
 * it; there is no separate teams table to keep in sync.
 */
export async function listTeams(): Promise<TeamOption[]> {
  const users = await listUsers();
  const seen = new Set<string>(BASE_TEAMS);
  for (const user of users) {
    if (user.team.trim()) seen.add(user.team.trim());
  }
  return Array.from(seen)
    .sort((left, right) => labelFor(left).localeCompare(labelFor(right), "ar"))
    .map((team) => ({ value: team, label: labelFor(team) }));
}
