import "server-only";

import { isGlobalActor, toClearanceActor } from "@/lib/rbac/hierarchy";
import { isMissingSchemaObject } from "@/lib/rbac/repository";
import { findTeamRow, type TeamRow } from "@/lib/rbac/team-repository";
import type { ActiveSession } from "@/lib/rbac/types";
import type { ProvisionAccountInput } from "@/lib/schemas/provisioning";

import { ProvisioningError } from "./provisioning-errors";

/**
 * Resolves and authorises the team a courier is being attached to.
 *
 * A team belongs to one city, so the city is read from the team row, never from
 * the client. The actor must reach that city (`app.can_manage_city()` mirrors
 * this rule) and the team's city must be part of the courier's own scope,
 * otherwise an operator could attach a rep to a city they do not control.
 */
export async function resolveTeam(
  session: ActiveSession,
  input: ProvisionAccountInput,
): Promise<TeamRow | null> {
  if (!input.teamId) return null;

  let team: TeamRow | null;
  try {
    team = await findTeamRow(input.teamId);
  } catch (error) {
    if (isMissingSchemaObject(error)) {
      throw new ProvisioningError(
        "TEAM_STORE_UNAVAILABLE",
        "إدارة الفرق غير مُفعّلة على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }

  if (!team) {
    throw new ProvisioningError(
      "TEAM_NOT_FOUND",
      "الفريق المحدد لم يعد موجوداً.",
      422,
    );
  }

  const actor = toClearanceActor(session);
  const allowed =
    isGlobalActor(actor) || actor.accessibleCities.includes(team.city_id);
  if (!allowed) {
    throw new ProvisioningError(
      "TEAM_OUT_OF_SCOPE",
      "الفريق يخص مدينة خارج نطاقك.",
      403,
    );
  }

  if (!input.accessibleCities.includes(team.city_id)) {
    throw new ProvisioningError(
      "TEAM_CITY_MISMATCH",
      "مدينة الفريق يجب أن تكون ضمن نطاق مدن المندوب.",
      422,
    );
  }

  return team;
}
