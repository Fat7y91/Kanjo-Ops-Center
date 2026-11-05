import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { monthWindowBounds } from "@/lib/kpi/calendar";

/**
 * Tier 4 repository for the KPI Vault (`app` schema, Supabase).
 *
 * The vault is the single SQL source of KPI truth:
 *
 * - **Live month** — the current month is computed on read from per-record
 *   attribution: `app.catalog_products.created_by` (data entry),
 *   `app.merchants.first_entry_by` (activations) and
 *   `app.merchants.contracted_by_team_id` + agreed/target margins
 *   (contracting). The active `app.commission_rates` row for the rep's city
 *   prices the live salary.
 * - **History** — past months are read strictly from `app.kpi_snapshots`,
 *   which are immutable once locked.
 *
 * The service-role client bypasses RLS, so the application layers enforce the
 * viewer scope (reps locked to themselves, admins may filter) in Tier 3.
 * Every read degrades to `null` when the database is not configured or the
 * schema is mid-migration, so the dashboard renders an honest empty state
 * instead of a 500.
 */

export type VaultRate = {
  activationFee: number;
  photoFee: number;
  baseFee: number;
};

export type VaultTeamContracting = {
  count: number;
  /** Average agreed/target margin across the month's closed contracts (%). */
  marginRatio: number;
};

export type VaultSnapshotFact = {
  activations: number;
  itemsAdded: number;
  contractsClosed: number;
  marginRatio: number;
  salary: number;
  status: "pending" | "paid";
  /**
   * V1 payroll-snapshot metrics that have no dedicated V2 column (products,
   * vendors, photos, time tracking). Preserved verbatim and shown as a separate
   * provenance strip; they never feed the salary formula.
   */
  legacyMetrics: Record<string, unknown> | null;
};

export type LiveVault = {
  activationsByRep: Map<string, number>;
  itemsByRep: Map<string, number>;
  contractsByTeam: Map<string, VaultTeamContracting>;
  /** Keyed by city id; the null key is the global fallback row. */
  ratesByCity: Map<string | null, VaultRate>;
};

const MERCHANT_COLUMNS =
  "id,first_entry_by,first_entry_at,contracted_by_team_id,contract_state,agreed_margin,target_margin,updated_at";

const CLOSED_STATES = ["final_contract", "signed_contract"];

export function isKpiVaultConfigured(): boolean {
  return hasSupabaseConfig();
}

function toRate(row: {
  merchant_activation_fee: unknown;
  photo_item_fee: unknown;
  contracting_base_fee: unknown;
}): VaultRate {
  return {
    activationFee: Number(row.merchant_activation_fee),
    photoFee: Number(row.photo_item_fee),
    baseFee: Number(row.contracting_base_fee ?? 100),
  };
}

/** Live month inputs: per-rep and per-team counts plus the fee schedule. */
export async function loadLiveMonthVault(
  month: string,
): Promise<LiveVault | null> {
  if (!isKpiVaultConfigured()) return null;

  const { start, end } = monthWindowBounds(month);
  const client = getSupabaseServerClient();

  try {
    const [productsResult, activationsResult, contractsResult, ratesResult] =
      await Promise.all([
        client
          .schema("app")
          .from("catalog_products")
          .select("created_by")
          .gte("created_at", start)
          .lt("created_at", end),
        client
          .schema("app")
          .from("merchants")
          .select(MERCHANT_COLUMNS)
          .gte("first_entry_at", start)
          .lt("first_entry_at", end),
        client
          .schema("app")
          .from("merchants")
          .select(MERCHANT_COLUMNS)
          .in("contract_state", CLOSED_STATES)
          .not("contracted_by_team_id", "is", null)
          .gte("updated_at", start)
          .lt("updated_at", end),
        client
          .schema("app")
          .from("commission_rates")
          .select(
            "city_id,merchant_activation_fee,photo_item_fee,contracting_base_fee",
          ),
      ]);

    for (const result of [
      productsResult,
      activationsResult,
      contractsResult,
      ratesResult,
    ]) {
      if (result.error) {
        if (isMissingSchemaObject(result.error)) return null;
        return null;
      }
    }

    const itemsByRep = new Map<string, number>();
    for (const row of (productsResult.data ?? []) as Array<{
      created_by: string | null;
    }>) {
      if (!row.created_by) continue;
      itemsByRep.set(row.created_by, (itemsByRep.get(row.created_by) ?? 0) + 1);
    }

    const activationsByRep = new Map<string, number>();
    for (const row of (activationsResult.data ?? []) as Array<{
      first_entry_by: string | null;
    }>) {
      if (!row.first_entry_by) continue;
      activationsByRep.set(
        row.first_entry_by,
        (activationsByRep.get(row.first_entry_by) ?? 0) + 1,
      );
    }

    const contractsByTeam = new Map<string, VaultTeamContracting>();
    const marginSums = new Map<string, number>();
    for (const row of (contractsResult.data ?? []) as Array<{
      contracted_by_team_id: string;
      agreed_margin: number | null;
      target_margin: number | null;
    }>) {
      const bucket = contractsByTeam.get(row.contracted_by_team_id) ?? {
        count: 0,
        marginRatio: 0,
      };
      bucket.count += 1;
      if (
        typeof row.agreed_margin === "number" &&
        typeof row.target_margin === "number" &&
        row.target_margin > 0
      ) {
        marginSums.set(
          row.contracted_by_team_id,
          (marginSums.get(row.contracted_by_team_id) ?? 0) +
            (row.agreed_margin / row.target_margin) * 100,
        );
      }
      contractsByTeam.set(row.contracted_by_team_id, bucket);
    }
    for (const [teamId, bucket] of contractsByTeam) {
      bucket.marginRatio =
        bucket.count > 0 ? (marginSums.get(teamId) ?? 0) / bucket.count : 0;
    }

    const ratesByCity = new Map<string | null, VaultRate>();
    for (const row of (ratesResult.data ?? []) as Array<{
      city_id: string | null;
      merchant_activation_fee: unknown;
      photo_item_fee: unknown;
      contracting_base_fee: unknown;
    }>) {
      ratesByCity.set(row.city_id, toRate(row));
    }

    return { activationsByRep, itemsByRep, contractsByTeam, ratesByCity };
  } catch {
    return null;
  }
}

/** Past months: strictly the immutable monthly snapshots. */
export async function loadSnapshotMonthVault(
  month: string,
): Promise<Map<string, VaultSnapshotFact> | null> {
  if (!isKpiVaultConfigured()) return null;

  const client = getSupabaseServerClient();
  try {
    const { data, error } = await client
      .schema("app")
      .from("kpi_snapshots")
      .select(
        "rep_id,month_year,new_merchants_activated,items_added,contracts_closed,avg_achievement_ratio,calculated_salary,status,legacy_metrics",
      )
      .eq("month_year", `${month}-01`);

    if (error) return null;

    const byRep = new Map<string, VaultSnapshotFact>();
    for (const row of (data ?? []) as Array<{
      rep_id: string;
      new_merchants_activated: number;
      items_added: number;
      contracts_closed: number;
      avg_achievement_ratio: number;
      calculated_salary: number;
      status: "pending" | "paid";
      legacy_metrics: Record<string, unknown> | null;
    }>) {
      byRep.set(row.rep_id, {
        activations: Number(row.new_merchants_activated),
        itemsAdded: Number(row.items_added),
        contractsClosed: Number(row.contracts_closed ?? 0),
        marginRatio: Number(row.avg_achievement_ratio ?? 0),
        salary: Number(row.calculated_salary),
        status: row.status,
        legacyMetrics: row.legacy_metrics ?? null,
      });
    }
    return byRep;
  } catch {
    return null;
  }
}

