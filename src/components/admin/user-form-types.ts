/** Shared shapes for the Users/RBAC dialogs. */

import type { Permission } from "@/lib/rbac/permissions";

export type LevelOption = { level: number; label: string };
export type CityOption = { id: string; name: string };

/** Level 1 is the field courier ("المندوب"), the only role that needs a team. */
export const COURIER_LEVEL = 1;

export type CreateForm = {
  name: string;
  phone: string;
  password: string;
  email: string;
  title: string;
  team: string;
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
    team: "",
    clearanceLevel: String(levels[levels.length - 1]?.level ?? 1),
    cityIds: cities.length === 1 ? [cities[0].id] : [],
    permissions: [],
  };
}

export function isCourier(clearanceLevel: string): boolean {
  return Number(clearanceLevel) === COURIER_LEVEL;
}
