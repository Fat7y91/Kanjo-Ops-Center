import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Tier 4 repository for `app.commission_rates`.
 *
 * The table holds one row per city plus a single NULL-city row as the global
 * fallback. This module is the only place that knows the table shape; callers
 * keep using the `CityCommissionRate` domain type. Reads degrade gracefully
 * when the deployment runs ahead of its migrations, mirroring the pattern in
 * `src/lib/rbac/rows.ts`.
 */

export type CommissionRateRow = {
  id: string;
  city_id: string | null;
  merchant_activation_fee: number;
  photo_item_fee: number;
  /** Absent (NULL) only on deployments that predate the contracting migration. */
  contracting_base_fee: number | null;
  updated_by: string | null;
  updated_at: string;
};

export type CommissionRateWrite = {
  cityId: string | null;
  merchantActivationFee: number;
  photoItemFee: number;
  contractingBaseFee: number;
  updatedBy: string;
};

const RATE_COLUMNS =
  "id,city_id,merchant_activation_fee,photo_item_fee,contracting_base_fee,updated_by,updated_at";

/** Projection that predates `app.commission_rates.contracting_base_fee`. */
const RATE_COLUMNS_LEGACY =
  "id,city_id,merchant_activation_fee,photo_item_fee,updated_by,updated_at";

export function isCommissionRatesDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/**
 * Reads all schedule rows, retrying without `contracting_base_fee` when the
 * column is absent. Only a missing schema object selects the legacy
 * projection; every other error is returned untouched.
 */
export async function selectCommissionRateRows(
  client: SupabaseClient,
): Promise<{ rows: CommissionRateRow[]; error: unknown }> {
  const query = (columns: string) =>
    client.schema("app").from("commission_rates").select(columns);

  const primary = await query(RATE_COLUMNS);
  if (!primary.error) {
    return {
      rows: (primary.data ?? []) as unknown as CommissionRateRow[],
      error: null,
    };
  }

  if (!isMissingSchemaObject(primary.error)) {
    return { rows: [], error: primary.error };
  }

  const legacy = await query(RATE_COLUMNS_LEGACY);
  if (legacy.error) return { rows: [], error: legacy.error };
  return {
    rows: ((legacy.data ?? []) as unknown as CommissionRateRow[]).map(
      (row) => ({
        ...row,
        contracting_base_fee: null,
      }),
    ),
    error: null,
  };
}

/** All schedule rows, or null when Supabase is not configured. */
export async function listCommissionRateRows(): Promise<
  CommissionRateRow[] | null
> {
  if (!hasSupabaseConfig()) return null;

  const { rows, error } = await selectCommissionRateRows(
    getSupabaseServerClient(),
  );
  if (error) throw error;
  return rows;
}

/** The schedule row for a city, or the global fallback row for null. */
export async function findCommissionRateRow(
  cityId: string | null,
): Promise<CommissionRateRow | null> {
  const client = getSupabaseServerClient();
  const base = client
    .schema("app")
    .from("commission_rates")
    .select(RATE_COLUMNS);
  const scoped = cityId === null ? base.is("city_id", null) : base.eq("city_id", cityId);
  const { data, error } = await scoped.maybeSingle();

  if (error) throw error;
  return (data as CommissionRateRow | null) ?? null;
}

export async function updateCommissionRateRow(
  id: string,
  write: Omit<CommissionRateWrite, "cityId">,
): Promise<CommissionRateRow> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("commission_rates")
    .update({
      merchant_activation_fee: write.merchantActivationFee,
      photo_item_fee: write.photoItemFee,
      contracting_base_fee: write.contractingBaseFee,
      updated_by: write.updatedBy,
    })
    .eq("id", id)
    .select(RATE_COLUMNS)
    .single();

  if (error) throw error;
  return data as CommissionRateRow;
}

export async function insertCommissionRateRow(
  write: CommissionRateWrite,
): Promise<CommissionRateRow> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("commission_rates")
    .insert({
      city_id: write.cityId,
      merchant_activation_fee: write.merchantActivationFee,
      photo_item_fee: write.photoItemFee,
      contracting_base_fee: write.contractingBaseFee,
      updated_by: write.updatedBy,
    })
    .select(RATE_COLUMNS)
    .single();

  if (error) throw error;
  return data as CommissionRateRow;
}
