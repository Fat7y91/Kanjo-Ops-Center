import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { RidersError } from "./errors";
import { asNumber, type LocationRow } from "./rows";
import type {
  LocationCatalog,
  LocationCity,
  LocationGovernorate,
  NextSequences,
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

type NextSequenceRow = {
  governorate_alpha: string;
  governorate_num: string;
  city_alpha: string;
  city_num: string;
  starting_sequence: number;
  max_rider_seq: number;
  next_rider_seq: number;
  max_receipt_seq: number;
  next_receipt_seq: number;
  next_hb_seq: number;
  next_hp_seq: number;
  next_tsh_seq: number;
  next_cap_seq: number;
};

export async function getNextSequence(
  governorateName: string,
  cityName: string,
): Promise<NextSequences> {
  const client = getSupabaseServerClient();
  const { data, error } = await client.schema("app").rpc("rider_next_sequences", {
    p_governorate: governorateName,
    p_city: cityName,
  });

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new RidersError(
        "STORE_UNAVAILABLE",
        "خدمة العهد غير متاحة حالياً. حاول لاحقاً.",
        503,
      );
    }
    const message =
      typeof error === "object" && error !== null
        ? String((error as { message?: unknown }).message ?? "")
        : "";
    if (message.includes("LOCATION_NOT_FOUND")) {
      throw new RidersError(
        "LOCATION_NOT_FOUND",
        "المحافظة أو المدينة غير مسجلة.",
        400,
      );
    }
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as NextSequenceRow | null;
  if (!row) {
    throw new RidersError(
      "RIDERS_FAILED",
      "تعذر حساب أرقام التسلسل.",
      502,
    );
  }

  return {
    governorate: governorateName,
    city: cityName,
    governorateAlpha: row.governorate_alpha,
    governorateNum: row.governorate_num,
    cityAlpha: row.city_alpha,
    cityNum: row.city_num,
    startingSequence: asNumber(row.starting_sequence),
    maxRiderSequence: asNumber(row.max_rider_seq),
    nextRiderSequence: asNumber(row.next_rider_seq),
    maxReceiptSequence: asNumber(row.max_receipt_seq),
    nextReceiptSequence: asNumber(row.next_receipt_seq),
    nextAssetSequences: {
      HB: asNumber(row.next_hb_seq),
      HP: asNumber(row.next_hp_seq),
      TSH: asNumber(row.next_tsh_seq),
      CAP: asNumber(row.next_cap_seq),
    },
  };
}
