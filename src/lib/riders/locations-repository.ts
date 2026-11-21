import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import {
  buildCustodyNumber,
  buildRiderCode,
  nextSequence,
  type LocationCodeParts,
} from "./codes";
import { RidersError } from "./errors";
import { asNumber, type LocationRow } from "./rows";
import type {
  LocationCatalog,
  LocationCity,
  LocationGovernorate,
  NextSequence,
} from "./types";

const LOCATION_COLUMNS =
  "governorate_name,city_name,level,alpha_code,numeric_code,starting_sequence";

export async function listLocations(): Promise<LocationCatalog> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("governorate_city_codes")
    .select(LOCATION_COLUMNS)
    .order("governorate_name", { ascending: true });

  if (error) {
    if (isMissingSchemaObject(error)) {
      return { governorates: [], cities: [] };
    }
    throw error;
  }

  const governorates: LocationGovernorate[] = [];
  const cities: LocationCity[] = [];
  for (const row of (data ?? []) as unknown as LocationRow[]) {
    if (row.level === "governorate") {
      governorates.push({
        name: row.governorate_name,
        alphaCode: row.alpha_code,
        numericCode: row.numeric_code,
      });
    } else {
      cities.push({
        governorateName: row.governorate_name,
        name: row.city_name,
        alphaCode: row.alpha_code,
        numericCode: row.numeric_code,
        startingSequence: row.starting_sequence,
      });
    }
  }

  cities.sort(
    (left, right) =>
      left.governorateName.localeCompare(right.governorateName, "ar") ||
      left.name.localeCompare(right.name, "ar"),
  );
  return { governorates, cities };
}

async function findLocation(
  governorateName: string,
  cityName: string,
): Promise<{ gov: LocationRow; city: LocationRow }> {
  const client = getSupabaseServerClient();
  const [govResult, cityResult] = await Promise.all([
    client
      .schema("app")
      .from("governorate_city_codes")
      .select(LOCATION_COLUMNS)
      .eq("governorate_name", governorateName)
      .eq("level", "governorate")
      .maybeSingle(),
    client
      .schema("app")
      .from("governorate_city_codes")
      .select(LOCATION_COLUMNS)
      .eq("governorate_name", governorateName)
      .eq("city_name", cityName)
      .eq("level", "city")
      .maybeSingle(),
  ]);

  if (govResult.error) throw govResult.error;
  if (cityResult.error) throw cityResult.error;
  if (!govResult.data || !cityResult.data) {
    throw new RidersError(
      "LOCATION_NOT_FOUND",
      "المحافظة أو المدينة غير مسجلة.",
      400,
    );
  }
  return {
    gov: govResult.data as unknown as LocationRow,
    city: cityResult.data as unknown as LocationRow,
  };
}

export async function getNextSequence(
  governorateName: string,
  cityName: string,
): Promise<NextSequence> {
  const { gov, city } = await findLocation(governorateName, cityName);
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("delivery_riders")
    .select("sequence_number")
    .eq("governorate_code", gov.alpha_code)
    .eq("city_code", city.alpha_code)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && !isMissingSchemaObject(error)) throw error;
  const maxSequence = data
    ? asNumber((data as { sequence_number?: number }).sequence_number)
    : null;
  const sequence = nextSequence(maxSequence, city.starting_sequence);
  const parts: LocationCodeParts = {
    govAlpha: gov.alpha_code,
    cityAlpha: city.alpha_code,
    govNum: gov.numeric_code,
    cityNum: city.numeric_code,
  };

  return {
    governorate: governorateName,
    city: cityName,
    sequence,
    maxSequence,
    startingSequence: city.starting_sequence,
    governorateAlpha: gov.alpha_code,
    governorateNum: gov.numeric_code,
    cityAlpha: city.alpha_code,
    cityNum: city.numeric_code,
    riderCode: buildRiderCode(parts, sequence),
    custodyNumber: buildCustodyNumber(parts, sequence),
  };
}
