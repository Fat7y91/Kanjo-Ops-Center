import type { AppUser } from "./types";
import { getUserById, updateUser } from "./users";

/**
 * Per-user city scope writes.
 *
 * Split from `users.ts` so the roster facade stays within the file budget. City
 * scope is a field-ops concern that happens to be stored on the profile: a city
 * manager is added to a city by appending to that operator's `accessibleCities`,
 * and removed the same way. Both paths go through `updateUser`, so the invite
 * rules, the revision bump and the seed-store fallback stay in one place.
 */

export async function addUserCityScope(
  id: string,
  cityId: string,
): Promise<AppUser> {
  const current = await getUserById(id);
  if (!current) throw new Error("User not found");

  if (current.accessibleCities.includes(cityId)) return current;

  return updateUser(id, {
    accessibleCities: [...current.accessibleCities, cityId],
  });
}

export async function removeUserCityScope(
  id: string,
  cityId: string,
): Promise<AppUser> {
  const current = await getUserById(id);
  if (!current) throw new Error("User not found");

  if (!current.accessibleCities.includes(cityId)) return current;

  return updateUser(id, {
    accessibleCities: current.accessibleCities.filter(
      (candidate) => candidate !== cityId,
    ),
  });
}
