import { computePayroll, type PayrollResult } from "./engine";
import {
  isPayrollDatabaseConfigured,
  listPayrollProfileRows,
} from "./profiles-repository";
import {
  fallbackContributions,
  listContributionRollup,
} from "./repository";
import type { PayrollProfile } from "./types";

/**
 * Tier 3 payroll assembly.
 *
 * Fixed terms come from `app.payroll_profiles` through the Tier 4 repository;
 * there is no seed. Contributions come from `app.payroll_contributions_rollup`
 * in one grouped read, with a single-pass report fallback only while that view
 * is not deployed. Nothing is cached across requests, so a profile edited by an
 * admin is visible on the next payslip render.
 */

export function isPayrollConfigured(): boolean {
  return isPayrollDatabaseConfigured();
}

export async function listPayrollProfiles(): Promise<PayrollProfile[]> {
  return listPayrollProfileRows();
}

export type Payslip = {
  profile: PayrollProfile;
  contribution: number;
  result: PayrollResult;
};

export async function buildPayslips(viewer?: {
  /** The signed-in operator's user id; only their row survives a self-only view. */
  userId: string;
  /** When false the caller may only read its own payslip. */
  canViewAll: boolean;
}): Promise<Payslip[]> {
  const profiles = await listPayrollProfiles();
  const contributions =
    (await listContributionRollup()) ?? (await fallbackContributions());

  const scoped =
    viewer && !viewer.canViewAll
      ? profiles.filter((profile) => profile.userId === viewer.userId)
      : profiles;

  return scoped.map((profile) => {
    const contribution = contributions.get(profile.userId)?.contribution ?? 0;
    return {
      profile,
      contribution,
      result: computePayroll(profile, contribution),
    };
  });
}
