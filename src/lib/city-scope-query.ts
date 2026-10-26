import { listCities } from "@/lib/field-ops/store";
import type { City } from "@/lib/field-ops/types";
import type { ActiveSession } from "@/lib/rbac/types";

export function isGlobalSession(session: ActiveSession): boolean {
  return session.globalScope || session.clearanceLevel >= 4;
}

export function effectiveCityIds(session: ActiveSession): string[] {
  if (isGlobalSession(session)) {
    return listCities().map((city) => city.id);
  }
  return [...session.accessibleCities];
}

export function canAccessCity(
  session: ActiveSession,
  cityId: string,
): boolean {
  return (
    session.permissions.includes("view_cities") &&
    effectiveCityIds(session).includes(cityId)
  );
}

export function scopedCities(session: ActiveSession): City[] {
  if (!session.permissions.includes("view_cities")) return [];
  const allowed = new Set(effectiveCityIds(session));
  return listCities().filter((city) => allowed.has(city.id));
}
