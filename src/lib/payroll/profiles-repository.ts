import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { PayrollProfile } from "./types";

/**
 * Tier 4 repository for the payroll profile tables
 * (`20261030000200_payroll.sql`).
 *
 * A payslip's fixed terms live in `app.payroll_profiles` and its commission
 * bands in `app.payroll_commission_tiers`; the operator's name and title come
 * from `app.users`, the same row RBAC uses. This module is the only one that
 * knows those column names.
 *
 * There is no seed fallback: a deployment without a database yields no
 * profiles rather than invented salaries. Reads degrade one migration at a
 * time so a code deploy ahead of its schema still renders.
 */

const PROFILE_COLUMNS =
  "user_id,base_salary_minor,transport_minor,data_entry_rate_minor,data_entry_count,incentive_multiplier,currency,active";

const TIER_COLUMNS = "user_id,threshold_minor,rate";

type ProfileRow = {
  user_id: string;
  base_salary_minor: number | string;
  transport_minor: number | string;
  data_entry_rate_minor: number | string;
  data_entry_count: number | string;
  incentive_multiplier: number | string;
  currency: PayrollProfile["currency"];
  active: boolean;
};

type TierRow = {
  user_id: string;
  threshold_minor: number | string;
  rate: number | string;
};

type UserRow = {
  id: string;
  full_name: string;
  title: string;
};

/**
 * `Number.POSITIVE_INFINITY` cannot be written to a `bigint` column, so the
 * top band is stored as a sentinel above any realistic contribution. The engine
 * sorts bands ascending, and any contribution below the sentinel returns the
 * cumulative total before the overflow branch.
 */
const TOP_BAND_SENTINEL = 9_000_000_000_000_000;

function toMinor(value: number | string | null): number {
  return Number(value ?? 0) / 100;
}

function thresholdFromDb(value: number | string): number {
  const threshold = toMinor(value);
  return threshold >= TOP_BAND_SENTINEL / 100
    ? Number.POSITIVE_INFINITY
    : threshold;
}

function thresholdToDb(threshold: number): number {
  return Number.isFinite(threshold)
    ? Math.round(threshold * 100)
    : TOP_BAND_SENTINEL;
}

export function isPayrollDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

export async function listPayrollProfileRows(): Promise<PayrollProfile[]> {
  if (!isPayrollDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const [profiles, tiers, users] = await Promise.all([
    client
      .schema("app")
      .from("payroll_profiles")
      .select(PROFILE_COLUMNS)
      .eq("active", true),
    client
      .schema("app")
      .from("payroll_commission_tiers")
      .select(TIER_COLUMNS)
      .order("threshold_minor", { ascending: true }),
    client.schema("app").from("users").select("id,full_name,title"),
  ]);

  if (profiles.error) {
    if (isMissingSchemaObject(profiles.error)) return [];
    throw profiles.error;
  }
  if (tiers.error && !isMissingSchemaObject(tiers.error)) throw tiers.error;
  if (users.error && !isMissingSchemaObject(users.error)) throw users.error;

  const usersById = new Map(
    ((users.error ? [] : users.data) ?? []).map((row) => {
      const user = row as unknown as UserRow;
      return [user.id, user];
    }),
  );

  const tiersByUser = new Map<string, PayrollProfile["commissionTiers"]>();
  for (const row of (tiers.error ? [] : tiers.data) ?? []) {
    const tier = row as unknown as TierRow;
    const bucket = tiersByUser.get(tier.user_id) ?? [];
    bucket.push({
      threshold: thresholdFromDb(tier.threshold_minor),
      rate: Number(tier.rate),
    });
    tiersByUser.set(tier.user_id, bucket);
  }

  return ((profiles.data ?? []) as unknown as ProfileRow[]).map((row) => {
    const user = usersById.get(row.user_id);
    return {
      userId: row.user_id,
      userName: user?.full_name ?? "",
      title: user?.title ?? "",
      baseSalary: toMinor(row.base_salary_minor),
      transportAllowance: toMinor(row.transport_minor),
      commissionTiers: tiersByUser.get(row.user_id) ?? [],
      dataEntryRate: toMinor(row.data_entry_rate_minor),
      dataEntryCount: Number(row.data_entry_count),
      incentiveMultiplier: Number(row.incentive_multiplier),
      currency: row.currency,
    };
  });
}

/**
 * Writes one profile and replaces its band set atomically enough for admin
 * editing: the tiers are deleted and re-inserted because a band is defined by
 * its threshold, not by an independent id.
 */
export async function upsertPayrollProfile(
  profile: PayrollProfile,
): Promise<void> {
  if (!isPayrollDatabaseConfigured()) {
    throw new Error("PAYROLL_STORE_UNAVAILABLE");
  }

  const client = getSupabaseServerClient();
  const { error: profileError } = await client
    .schema("app")
    .from("payroll_profiles")
    .upsert(
      {
        user_id: profile.userId,
        base_salary_minor: Math.round(profile.baseSalary * 100),
        transport_minor: Math.round(profile.transportAllowance * 100),
        data_entry_rate_minor: Math.round(profile.dataEntryRate * 100),
        data_entry_count: Math.round(profile.dataEntryCount),
        incentive_multiplier: profile.incentiveMultiplier,
        currency: profile.currency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (profileError) throw profileError;

  const { error: deleteError } = await client
    .schema("app")
    .from("payroll_commission_tiers")
    .delete()
    .eq("user_id", profile.userId);
  if (deleteError) throw deleteError;

  if (profile.commissionTiers.length === 0) return;
  const { error: tierError } = await client
    .schema("app")
    .from("payroll_commission_tiers")
    .insert(
      profile.commissionTiers.map((tier) => ({
        user_id: profile.userId,
        threshold_minor: thresholdToDb(tier.threshold),
        rate: tier.rate,
      })),
    );
  if (tierError) throw tierError;
}
