import { listCities } from "@/lib/field-ops/store";
import type { City } from "@/lib/field-ops/types";
import { permissionsForModule } from "@/lib/rbac/modules";
import type { ActiveSession } from "@/lib/rbac/types";

/**
 * Capabilities that open the cities module.
 *
 * The sidebar advertises `/cities` to anyone holding any of these, so the data
 * helpers must accept the same set; otherwise a manager with only
 * `manage_cities` or `add_city` would open an empty screen.
 */
const CITY_ACCESS = permissionsForModule("/cities");

function canOpenCities(session: ActiveSession): boolean {
  return CITY_ACCESS.some((permission) =>
    session.permissions.includes(permission),
  );
}

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
    canOpenCities(session) && effectiveCityIds(session).includes(cityId)
  );
}

export function scopedCities(session: ActiveSession): City[] {
  if (!canOpenCities(session)) return [];
  const allowed = new Set(effectiveCityIds(session));
  return listCities().filter((city) => allowed.has(city.id));
}
