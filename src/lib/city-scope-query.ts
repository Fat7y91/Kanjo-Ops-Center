import { listCities } from "@/lib/field-ops/store";
import type { City } from "@/lib/field-ops/types";
import type { ActiveSession } from "@/lib/rbac/types";

export function canAccessCity(
  session: ActiveSession,
  cityId: string,
): boolean {
  return (
    session.permissions.includes("view_cities") &&
    session.accessibleCities.includes(cityId)
  );
}

export function scopedCities(session: ActiveSession): City[] {
  if (!session.permissions.includes("view_cities")) return [];
  const allowed = new Set(session.accessibleCities);
  return listCities().filter((city) => allowed.has(city.id));
}
