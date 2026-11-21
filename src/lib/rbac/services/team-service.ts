import "server-only";

import { z } from "zod";

import { isGlobalActor, toClearanceActor, type ClearanceActor } from "@/lib/rbac/hierarchy";
import { RbacDeniedError } from "@/lib/rbac/management";
import { isMissingSchemaObject } from "@/lib/rbac/repository";
import type { CityTeam } from "@/lib/rbac/types";
import { insertTeamRow, isTeamDatabaseConfigured } from "@/lib/rbac/team-repository";

/**
 * Team management. A team is minted inside a city by whoever manages that city
 * (`app.can_manage_city()`): executives anywhere, a city manager in their own
 * cities only. The check below mirrors the SQL policy so the UI and the
 * database cannot disagree about who may create a team.
 */

export const createTeamSchema = z.object({
  cityId: z.string().trim().min(1, "المدينة مطلوبة."),
  name: z.string().trim().min(2, "اسم الفريق مطلوب.").max(120),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export class TeamError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "TeamError";
    this.code = code;
    this.status = status;
  }
}

export function assertCanManageCity(
  actor: Pick<ClearanceActor, "clearanceLevel" | "globalScope" | "accessibleCities">,
  cityId: string,
): void {
  if (isGlobalActor(actor)) return;
  if (!actor.accessibleCities.includes(cityId)) {
    throw new RbacDeniedError(
      "CITY_DENIED",
      "هذه المدينة خارج نطاقك.",
    );
  }
}

export async function createTeam(
  session: Parameters<typeof toClearanceActor>[0],
  rawInput: unknown,
): Promise<CityTeam> {
  if (!isTeamDatabaseConfigured()) {
    throw new TeamError(
      "TEAM_STORE_UNAVAILABLE",
      "إدارة الفرق تتطلب قاعدة البيانات.",
      503,
    );
  }

  const input = createTeamSchema.parse(rawInput);
  assertCanManageCity(toClearanceActor(session), input.cityId);

  try {
    const row = await insertTeamRow(input.cityId, input.name);
    return { id: row.id, cityId: row.city_id, name: row.name };
  } catch (error) {
    // `field_teams_city_name_key` is a per-city, case-insensitive unique index.
    if (isUniqueViolation(error)) {
      throw new TeamError(
        "TEAM_EXISTS",
        "يوجد فريق بهذا الاسم في المدينة نفسها.",
        409,
      );
    }
    // The table is absent when the deployment predates the teams migration.
    // Answer with a clear, actionable error instead of a raw PostgREST code.
    if (isMissingSchemaObject(error)) {
      throw new TeamError(
        "TEAM_STORE_UNAVAILABLE",
        "إدارة الفرق غير مُفعّلة على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
