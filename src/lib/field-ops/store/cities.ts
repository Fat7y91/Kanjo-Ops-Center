import { normalizeSearchText } from "@/lib/search/normalize";
import type { City } from "@/lib/field-ops/types";
import { zoneToBoundary } from "@/lib/field-ops/types";
import type { AppUser } from "@/lib/rbac/types";
import { getUserById, listUsers } from "@/lib/rbac/users";
import {
  addUserCityScope,
  removeUserCityScope,
} from "@/lib/rbac/user-city-scope";
import { memoizeRead } from "@/lib/rbac/snapshot-cache";
import type { CityCreateInput } from "@/lib/schemas/field-ops";

import {
  FieldOpsError,
  type Actor,
} from "./core";
import {
  findCityByName,
  getCityRow,
  insertCity,
  isCitiesDatabaseConfigured,
  listCityRows,
  updateCityRow,
} from "../city-repository";

/**
 * City catalogue, backed by `app.cities`.
 *
 * The catalogue used to be a process-local global, so a city created in one
 * Worker isolate disappeared on the next request and two workers disagreed
 * about the same city. `20261110000000_field_ops_catalogue.sql` makes the table
 * the single source of truth; this module keeps the domain rules (unique name,
 * manager scope) and the repository owns the columns.
 *
 * City managers are `app.user_city_scope` grants, not a column on the city, so
 * assigning a manager is the same write the RBAC layer performs.
 */

function requireDatabase(): void {
  if (!isCitiesDatabaseConfigured()) {
    throw new FieldOpsError(
      "CITIES_UNAVAILABLE",
      "قاعدة بيانات المدن غير متصلة.",
      503,
    );
  }
}

export const listCities = memoizeRead(async (): Promise<City[]> => {
  const rows = await listCityRows();
  if (!rows) return [];
  return rows.cities.sort((left, right) =>
    left.name.localeCompare(right.name, "ar"),
  );
});

export async function getCityById(cityId: string): Promise<City | null> {
  return getCityRow(cityId);
}

function buildZone(input: CityCreateInput): City["zone"] {
  return input.zone.map((point) => ({
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
  }));
}

export async function createCity(
  input: CityCreateInput,
  actor: Actor,
): Promise<City> {
  requireDatabase();
  const normalized = normalizeSearchText(input.name);
  const existing = await findCityByName(input.name);
  if (existing || (await listCities()).some((city) => normalizeSearchText(city.name) === normalized)) {
    throw new FieldOpsError("CITY_EXISTS", "توجد مدينة بهذا الاسم بالفعل.", 409);
  }

  const zone = buildZone(input);
  const now = new Date().toISOString();
  const city: City = {
    id: `city-${crypto.randomUUID().slice(0, 8)}`,
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
    createdAt: now,
    createdBy: actor.id,
    createdByName: actor.name,
  };

  const saved = await insertCity(city);
  await addUserCityScope(actor.id, saved.id);
  return { ...saved, opsManagers: [actor.id] };
}

export async function updateCity(
  cityId: string,
  input: CityCreateInput,
): Promise<City> {
  requireDatabase();
  const city = await getCityRow(cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const normalized = normalizeSearchText(input.name);
  const conflict = await findCityByName(input.name);
  if (conflict && conflict !== cityId) {
    throw new FieldOpsError("CITY_EXISTS", "توجد مدينة أخرى بهذا الاسم.", 409);
  }
  if (
    !conflict &&
    (await listCities()).some(
      (candidate) =>
        candidate.id !== cityId &&
        normalizeSearchText(candidate.name) === normalized,
    )
  ) {
    throw new FieldOpsError("CITY_EXISTS", "توجد مدينة أخرى بهذا الاسم.", 409);
  }

  const zone = buildZone(input);
  const next: City = {
    ...city,
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
  };

  const saved = await updateCityRow(cityId, next);
  if (!saved) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }
  return { ...saved, opsManagers: city.opsManagers };
}

export async function listCityManagers(cityId: string): Promise<AppUser[]> {
  const city = await getCityRow(cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const resolved = await Promise.all(
    city.opsManagers.map((userId) => getUserById(userId)),
  );
  return resolved.filter((user): user is AppUser => Boolean(user));
}

/**
 * Active operators the city form may offer, memoised for the current request:
 * `listUsers()` is already the roster, so a page that renders both pays once.
 */
export const listAssignableManagers = memoizeRead(
  async (): Promise<AppUser[]> => {
    const users = await listUsers();
    return users.filter((user) => user.active);
  },
);

export async function assignCityManagers(
  cityId: string,
  userIds: readonly string[],
): Promise<City> {
  requireDatabase();
  const city = await getCityRow(cityId);
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

  return { ...city, opsManagers: Array.from(next) };
}

export async function revokeCityManager(
  cityId: string,
  userId: string,
): Promise<City> {
  requireDatabase();
  const city = await getCityRow(cityId);
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

  await removeUserCityScope(userId, cityId);
  return {
    ...city,
    opsManagers: city.opsManagers.filter((managerId) => managerId !== userId),
  };
}
