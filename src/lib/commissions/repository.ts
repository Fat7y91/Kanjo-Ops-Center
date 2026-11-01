import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { DEFAULT_COMMISSION_RATES } from "./types";

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
  contract_fee_tier_1: number;
  contract_fee_tier_2: number;
  contract_fee_tier_3: number;
  contract_fee_tier_4: number;
  updated_by: string | null;
  updated_at: string;
};

export type CommissionRateWrite = {
  cityId: string | null;
  merchantActivationFee: number;
  photoItemFee: number;
  contractFeeTier1: number;
  contractFeeTier2: number;
  contractFeeTier3: number;
  contractFeeTier4: number;
  updatedBy: string;
};

const RATE_COLUMNS =
  "id,city_id,merchant_activation_fee,photo_item_fee,contract_fee_tier_1,contract_fee_tier_2,contract_fee_tier_3,contract_fee_tier_4,updated_by,updated_at";

/** Projection for a deployment that has the flat fee but not the tiers yet. */
const RATE_COLUMNS_FLAT =
  "id,city_id,merchant_activation_fee,photo_item_fee,contracting_base_fee,updated_by,updated_at";

/** Projection that predates the contracting fee entirely. */
const RATE_COLUMNS_LEGACY =
  "id,city_id,merchant_activation_fee,photo_item_fee,updated_by,updated_at";

export function isCommissionRatesDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

type TierlessRateRow = Omit<
  CommissionRateRow,
  | "contract_fee_tier_1"
  | "contract_fee_tier_2"
  | "contract_fee_tier_3"
  | "contract_fee_tier_4"
>;

/** Applies one flat fee to all four bands, preserving the amount. */
function applyFlatFee(
  row: TierlessRateRow,
  flatFee: number,
): CommissionRateRow {
  return {
    ...row,
    contract_fee_tier_1: flatFee,
    contract_fee_tier_2: flatFee,
    contract_fee_tier_3: flatFee,
    contract_fee_tier_4: flatFee,
  };
}

/**
 * Reads all schedule rows, degrading one migration at a time when the
 * deployment runs ahead of its schema:
 *   1. tiered columns (current);
 *   2. the old flat `contracting_base_fee`, copied into all four bands so no
 *      amount silently changes;
 *   3. no contracting fee at all — the seeded default is the only honest
 *      stand-in left.
 * Only a missing schema object advances to the next step; every other error is
 * returned untouched.
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

  const flat = await query(RATE_COLUMNS_FLAT);
  if (!flat.error) {
    return {
      rows: (
        (flat.data ?? []) as unknown as (TierlessRateRow & {
          contracting_base_fee: number | null;
        })[]
      ).map(({ contracting_base_fee, ...row }) =>
        applyFlatFee(
          row,
          contracting_base_fee ??
            DEFAULT_COMMISSION_RATES.contractFeeTier1,
        ),
      ),
      error: null,
    };
  }

  if (!isMissingSchemaObject(flat.error)) {
    return { rows: [], error: flat.error };
  }

  const legacy = await query(RATE_COLUMNS_LEGACY);
  if (legacy.error) return { rows: [], error: legacy.error };
  return {
    rows: ((legacy.data ?? []) as unknown as TierlessRateRow[]).map((row) =>
      applyFlatFee(row, DEFAULT_COMMISSION_RATES.contractFeeTier1),
    ),
    error: null,
  };
}

/**
 * All schedule rows, or null when Supabase is not configured.
 *
 * The list read is the settings page's data source, so it must never throw
 * inside a Server Component. A schema migration in flight (or a lagging
 * PostgREST schema cache) surfaces as an error here while the rest of the app
 * still works; the page degrades to its "finance database unavailable" state
 * instead of crashing with a 500. Writes keep their strict error behaviour.
 */
export async function listCommissionRateRows(): Promise<
  CommissionRateRow[] | null
> {
  if (!hasSupabaseConfig()) return null;

  try {
    const { rows, error } = await selectCommissionRateRows(
      getSupabaseServerClient(),
    );
    if (error) return null;
    return rows;
  } catch {
    return null;
  }
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
      contract_fee_tier_1: write.contractFeeTier1,
      contract_fee_tier_2: write.contractFeeTier2,
      contract_fee_tier_3: write.contractFeeTier3,
      contract_fee_tier_4: write.contractFeeTier4,
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
      contract_fee_tier_1: write.contractFeeTier1,
      contract_fee_tier_2: write.contractFeeTier2,
      contract_fee_tier_3: write.contractFeeTier3,
      contract_fee_tier_4: write.contractFeeTier4,
      updated_by: write.updatedBy,
    })
    .select(RATE_COLUMNS)
    .single();

  if (error) throw error;
  return data as CommissionRateRow;
}
