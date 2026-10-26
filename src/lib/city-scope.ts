export const ACTIVE_CITY_KEY = "kanjo_active_city";
export const CITY_CHANGE_EVENT = "kanjo-city-change";

export function readActiveCityId(
  accessibleCityIds: readonly string[],
): string | null {
  if (typeof window === "undefined") {
    return accessibleCityIds[0] ?? null;
  }

  const stored = window.localStorage.getItem(ACTIVE_CITY_KEY);
  if (stored && accessibleCityIds.includes(stored)) return stored;
  return accessibleCityIds[0] ?? null;
}
