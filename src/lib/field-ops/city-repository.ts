import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { City, CityStage, Competitor, ZonePoint } from "./types";

/**
 * Tier 4 repository for `app.cities`.
 *
 * Created by `20261110000000_field_ops_catalogue.sql`. Cities used to be a
 * process-local global, so a city created in one Worker isolate vanished on the
 * next request. This module is the only one that knows the column names.
 *
 * City managers are not stored on the row: they are `app.user_city_scope`
 * grants, which is the same data the RBAC layer already writes. The caller
 * composes the two, keeping one source of truth for "who operates this city".
 */

const COLUMNS =
  "id,name,country,governorate,population,stage,competitors,strategic_notes,zone,created_by,created_by_name,created_at,updated_at";

type CityRow = {
  id: string;
  name: string;
  country: string;
  governorate: string;
  population: number | string;
  stage: CityStage;
  competitors: Competitor[] | null;
  strategic_notes: string;
  zone: ZonePoint[] | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

function toCity(row: CityRow, opsManagers: string[]): City {
  const zone = Array.isArray(row.zone) ? row.zone : [];
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    governorate: row.governorate,
    population: Number(row.population ?? 0),
    stage: row.stage,
    competitors: Array.isArray(row.competitors) ? row.competitors : [],
    strategicNotes: row.strategic_notes,
    zone,
    boundary: zoneToBoundary(zone),
    opsManagers,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
  };
}

/** Mirrors `zoneToBoundary` without importing the pure helper twice. */
function zoneToBoundary(zone: ZonePoint[]): City["boundary"] {
  const ring = zone.map((point) => [point.lng, point.lat] as [number, number]);
  if (ring.length > 0) ring.push([ring[0][0], ring[0][1]]);
  return { type: "Polygon", coordinates: [ring] };
}

export function isCitiesDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/** Raw city rows plus the manager scope that belongs to them. */
export async function listCityRows(): Promise<{
  cities: City[];
  managersByCity: Map<string, string[]>;
} | null> {
  if (!isCitiesDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const [cityResult, scopeResult] = await Promise.all([
    client.schema("app").from("cities").select(COLUMNS).order("name"),
    client.schema("app").from("user_city_scope").select("user_id,city_id"),
  ]);

  if (cityResult.error) {
    if (isMissingSchemaObject(cityResult.error)) return null;
    throw cityResult.error;
  }
  if (scopeResult.error && !isMissingSchemaObject(scopeResult.error)) {
    throw scopeResult.error;
  }

  const scopeRows = (scopeResult.data ?? []) as Array<{
    user_id: string;
    city_id: string;
  }>;
  const managersByCity = new Map<string, string[]>();
  for (const row of scopeRows) {
    const list = managersByCity.get(row.city_id) ?? [];
    list.push(row.user_id);
    managersByCity.set(row.city_id, list);
  }

  return {
    cities: ((cityResult.data ?? []) as unknown as CityRow[]).map((row) =>
      toCity(row, managersByCity.get(row.id) ?? []),
    ),
    managersByCity,
  };
}

export async function getCityRow(cityId: string): Promise<City | null> {
  if (!isCitiesDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("cities")
    .select(COLUMNS)
    .eq("id", cityId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  if (!data) return null;

  const { data: scope } = await client
    .schema("app")
    .from("user_city_scope")
    .select("user_id")
    .eq("city_id", cityId);
  const managers = ((scope ?? []) as Array<{ user_id: string }>).map(
    (row) => row.user_id,
  );
  return toCity(data as unknown as CityRow, managers);
}

export async function findCityByName(name: string): Promise<string | null> {
  if (!isCitiesDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("cities")
    .select("id")
    .ilike("name", name.trim())
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return data ? (data as { id: string }).id : null;
}

function writerColumns(city: City) {
  return {
    name: city.name,
    country: city.country,
    governorate: city.governorate,
    population: city.population,
    stage: city.stage,
    competitors: city.competitors,
    strategic_notes: city.strategicNotes,
    zone: city.zone,
    created_by: city.createdBy,
    created_by_name: city.createdByName,
  };
}

export async function insertCity(city: City): Promise<City> {
  requireDatabase();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("cities")
    .insert({
      id: city.id,
      ...writerColumns(city),
      created_at: city.createdAt,
      updated_at: city.createdAt,
    })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return toCity(data as unknown as CityRow, []);
}

export async function updateCityRow(
  cityId: string,
  city: City,
): Promise<City | null> {
  requireDatabase();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("cities")
    .update(writerColumns(city))
    .eq("id", cityId)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? toCity(data as unknown as CityRow, []) : null;
}

function requireDatabase(): void {
  if (!isCitiesDatabaseConfigured()) {
    throw new Error("CITIES_UNAVAILABLE: the city database is not connected");
  }
}
