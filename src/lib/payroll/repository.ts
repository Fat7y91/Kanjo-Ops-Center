import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Tier 4 repository for payroll contributions.
 *
 * `app.payroll_contributions_rollup` is a single grouped view over
 * `app.visit_reports`: one row per rep with their signed-contract earnings.
 * Reading it replaces the previous `contributionFor()` loop, which re-read the
 * entire report table for every profile (O(profiles × reports)) and was one of
 * the Edge CPU 1102 offenders.
 *
 * Returns `null` when Supabase is not configured or the view is not deployed;
 * the caller then falls back to the in-memory derivation.
 */

export type ContributionRow = {
  repId: string;
  contribution: number;
  signedVisits: number;
};

type ContributionDbRow = {
  rep_id: string;
  contribution: number | string | null;
  signed_visits: number | string | null;
};

export function isContributionRollupConfigured(): boolean {
  return hasSupabaseConfig();
}

export async function listContributionRollup(): Promise<
  Map<string, ContributionRow> | null
> {
  if (!isContributionRollupConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("payroll_contributions_rollup")
    .select("rep_id,contribution,signed_visits");

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }

  const byRep = new Map<string, ContributionRow>();
  for (const row of (data ?? []) as ContributionDbRow[]) {
    byRep.set(row.rep_id, {
      repId: row.rep_id,
      contribution: Number(row.contribution ?? 0),
      signedVisits: Number(row.signed_visits ?? 0),
    });
  }
  return byRep;
}

/**
 * One affordable fallback read for deployments without the rollup.
 *
 * It keeps the old semantics (merchant commission when known, otherwise the
 * frozen report amount) but performs a single pass over the reports instead of
 * one pass per profile. Used only when the view is not deployed.
 */
export async function fallbackContributions(): Promise<
  Map<string, ContributionRow>
> {
  const { listMerchants, listVisitReports } = await import(
    "@/lib/field-ops/store"
  );
  const reports = await listVisitReports();
  const merchants = new Map(
    (await listMerchants()).map((merchant) => [merchant.id, merchant]),
  );

  const byRep = new Map<string, ContributionRow>();
  for (const report of reports) {
    if (report.outcome !== "signed_contract") continue;
    const merchant = merchants.get(report.merchantId);
    const amount = merchant?.commissionAmount ?? report.commissionAmount;
    const current = byRep.get(report.repId) ?? {
      repId: report.repId,
      contribution: 0,
      signedVisits: 0,
    };
    current.contribution += amount;
    current.signedVisits += 1;
    byRep.set(report.repId, current);
  }
  return byRep;
}
