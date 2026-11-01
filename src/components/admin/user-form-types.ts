/** Shared shapes for the Users/RBAC dialogs. */

import type { Permission } from "@/lib/rbac/permissions";

export type LevelOption = { level: number; label: string };
export type CityOption = { id: string; name: string };

/** A field team owned by exactly one city (`app.field_teams`). */
export type CityTeamOption = { id: string; cityId: string; name: string };

/** Level 1 is the field courier ("المندوب"), the only role that needs a team. */
export const COURIER_LEVEL = 1;

export type CreateForm = {
  name: string;
  phone: string;
  password: string;
  email: string;
  title: string;
  /** `app.field_teams.id`; empty until the operator picks a team. */
  teamId: string;
  /** City that owns the picked team. Teams are city-bound, never global. */
  teamCityId: string;
  clearanceLevel: string;
  cityIds: string[];
  permissions: Permission[];
};

export function emptyForm(
  levels: LevelOption[],
  cities: CityOption[],
): CreateForm {
  return {
    name: "",
    phone: "",
    password: "",
    email: "",
    title: "",
    teamId: "",
    teamCityId: "",
    clearanceLevel: String(levels[levels.length - 1]?.level ?? 1),
    cityIds: cities.length === 1 ? [cities[0].id] : [],
    permissions: [],
  };
}

export function isCourier(clearanceLevel: string): boolean {
  return Number(clearanceLevel) === COURIER_LEVEL;
}
