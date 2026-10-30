import { normalizeSearchText } from "@/lib/search/normalize";
import type { City } from "@/lib/field-ops/types";
import {
  zoneToBoundary,
} from "@/lib/field-ops/types";
import type { AppUser } from "@/lib/rbac/types";
import {
  addUserCityScope,
  getUserById,
  listUsers,
  removeUserCityScope,
} from "@/lib/rbac/users";
import type { CityCreateInput } from "@/lib/schemas/field-ops";

import {
  FieldOpsError,
  bump,
  clone,
  getStore,
  id,
  isoNow,
  type Actor,
} from "./core";

export function listCities(): City[] {
  return clone(getStore().cities).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function getCityById(cityId: string): City | null {
  const city = getStore().cities.find((candidate) => candidate.id === cityId);
  return city ? clone(city) : null;
}

export async function createCity(
  input: CityCreateInput,
  actor: Actor,
): Promise<City> {
  const store = getStore();
  const normalized = normalizeSearchText(input.name);
  if (
    store.cities.some(
      (city) => normalizeSearchText(city.name) === normalized,
    )
  ) {
    throw new FieldOpsError(
      "CITY_EXISTS",
      "توجد مدينة بهذا الاسم بالفعل.",
      409,
    );
  }

  const zone = input.zone.map((point) => ({
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
  }));

  const city: City = {
    id: id("city"),
    name: input.name.trim(),
    country: input.country.trim(),
    governorate: input.governorate.trim(),
    population: input.population,
    stage: input.stage,
    competitors: input.competitors.map((competitor) => ({
      name: competitor.name.trim(),
      page: competitor.page.trim(),
      marketStrength: competitor.marketStrength,
    })),
    strategicNotes: input.strategicNotes.trim(),
    zone,
    boundary: zoneToBoundary(zone),
    opsManagers: [],
    createdAt: isoNow(),
    createdBy: actor.id,
    createdByName: actor.name,
  };

  store.cities.push(city);
  await addUserCityScope(actor.id, city.id);
  bump();
  return clone(city);
}

export function updateCity(cityId: string, input: CityCreateInput): City {
  const store = getStore();
  const city = store.cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const normalized = normalizeSearchText(input.name);
  if (
    store.cities.some(
      (candidate) =>
        candidate.id !== cityId &&
        normalizeSearchText(candidate.name) === normalized,
    )
  ) {
    throw new FieldOpsError(
      "CITY_EXISTS",
      "توجد مدينة أخرى بهذا الاسم.",
      409,
    );
  }

  const zone = input.zone.map((point) => ({
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
  }));

  city.name = input.name.trim();
  city.country = input.country.trim();
  city.governorate = input.governorate.trim();
  city.population = input.population;
  city.stage = input.stage;
  city.competitors = input.competitors.map((competitor) => ({
    name: competitor.name.trim(),
    page: competitor.page.trim(),
    marketStrength: competitor.marketStrength,
  }));
  city.strategicNotes = input.strategicNotes.trim();
  city.zone = zone;
  city.boundary = zoneToBoundary(zone);

  bump();
  return clone(city);
}

export async function listCityManagers(cityId: string): Promise<AppUser[]> {
  const city = getStore().cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const resolved = await Promise.all(
    city.opsManagers.map((userId) => getUserById(userId)),
  );
  return resolved.filter((user): user is AppUser => Boolean(user));
}

export async function listAssignableManagers(): Promise<AppUser[]> {
  const users = await listUsers();
  return users.filter((user) => user.active);
}

export async function assignCityManagers(
  cityId: string,
  userIds: readonly string[],
): Promise<City> {
  const store = getStore();
  const city = store.cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const uniqueIds = Array.from(new Set(userIds.map((id) => id.trim()))).filter(
    Boolean,
  );
  if (uniqueIds.length === 0) {
    throw new FieldOpsError(
      "MANAGER_REQUIRED",
      "اختر مديراً واحداً على الأقل.",
      422,
    );
  }

  const users = await Promise.all(
    uniqueIds.map(async (userId) => {
      const user = await getUserById(userId);
      if (!user || !user.active) {
        throw new FieldOpsError(
          "MANAGER_NOT_FOUND",
          "أحد المشغّلين المحددين غير موجود أو غير نشط.",
          422,
        );
      }
      return user;
    }),
  );

  const next = new Set(city.opsManagers);
  for (const user of users) {
    next.add(user.id);
    await addUserCityScope(user.id, cityId);
  }
  city.opsManagers = Array.from(next);

  bump();
  return clone(city);
}

export async function revokeCityManager(
  cityId: string,
  userId: string,
): Promise<City> {
  const city = getStore().cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  if (!city.opsManagers.includes(userId)) {
    throw new FieldOpsError(
      "MANAGER_NOT_ASSIGNED",
      "هذا المشغّل ليس مديراً للعمليات في المدينة.",
      404,
    );
  }

  city.opsManagers = city.opsManagers.filter(
    (managerId) => managerId !== userId,
  );
  await removeUserCityScope(userId, cityId);
  bump();
  return clone(city);
}
