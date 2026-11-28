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

/**
 * Every city id the session may operate in.
 *
 * Cities are rows in `app.cities`, so this is an async read: a global session
 * gets the ids that exist *now*, not the ids that existed when a seed literal
 * was written into the bundle.
 */
export async function effectiveCityIds(
  session: ActiveSession,
): Promise<string[]> {
  if (isGlobalSession(session)) {
    const cities = await listCities();
    return cities.map((city) => city.id);
  }
  return [...session.accessibleCities];
}

export async function canAccessCity(
  session: ActiveSession,
  cityId: string,
): Promise<boolean> {
  if (!canOpenCities(session)) return false;
  return (await effectiveCityIds(session)).includes(cityId);
}

export async function scopedCities(session: ActiveSession): Promise<City[]> {
  if (!canOpenCities(session)) return [];
  const allowed = new Set(await effectiveCityIds(session));
  const cities = await listCities();
  return cities.filter((city) => allowed.has(city.id));
}
