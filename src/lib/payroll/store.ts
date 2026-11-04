import { computePayroll, type PayrollResult } from "./engine";
import {
  fallbackContributions,
  listContributionRollup,
} from "./repository";
import { seedPayrollProfiles } from "./seed";
import type { PayrollProfile } from "./types";

const globalStore = globalThis as typeof globalThis & {
  __kanjoV2PayrollProfiles?: PayrollProfile[];
};

export function listPayrollProfiles(): PayrollProfile[] {
  if (!globalStore.__kanjoV2PayrollProfiles) {
    globalStore.__kanjoV2PayrollProfiles = seedPayrollProfiles();
  }
  return structuredClone(globalStore.__kanjoV2PayrollProfiles);
}

export type Payslip = {
  profile: PayrollProfile;
  contribution: number;
  result: PayrollResult;
};

/**
 * Builds one payslip per profile.
 *
 * Contributions come from `app.payroll_contributions_rollup` in a single
 * grouped read. The old implementation called `contributionFor()` inside the
 * profile loop and re-read the whole visit-report table per profile, which is
 * what pushed `/payroll` past the Edge CPU limit. The in-memory fallback still
 * does one pass over the reports, never one pass per profile.
 */
export async function buildPayslips(viewer?: {
  /** The signed-in operator's user id; only their row survives a self-only view. */
  userId: string;
  /** When false the caller may only read its own payslip. */
  canViewAll: boolean;
}): Promise<Payslip[]> {
  const profiles = listPayrollProfiles();
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
