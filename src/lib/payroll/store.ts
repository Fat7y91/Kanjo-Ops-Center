import { listMerchants } from "@/lib/field-ops/store";
import { listVisitReports } from "@/lib/field-ops/store";

import { computePayroll, type PayrollResult } from "./engine";
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

/**
 * Contracted contribution attributed to a rep.
 *
 * Derived from the live visit reports, so payroll never carries its own copy of
 * performance data and cannot disagree with the commission dashboard.
 */
export async function contributionFor(repId: string): Promise<number> {
  const reports = await listVisitReports();
  const merchants = new Map(
    listMerchants().map((merchant) => [merchant.id, merchant]),
  );
  let total = 0;
  for (const report of reports) {
    if (report.repId !== repId) continue;
    if (report.outcome !== "signed_contract") continue;
    const merchant = merchants.get(report.merchantId);
    total += merchant?.commissionAmount ?? report.commissionAmount;
  }
  return total;
}

export type Payslip = {
  profile: PayrollProfile;
  contribution: number;
  result: PayrollResult;
};

export async function buildPayslips(): Promise<Payslip[]> {
  const profiles = listPayrollProfiles();
  return Promise.all(
    profiles.map(async (profile) => {
      const contribution = await contributionFor(profile.userId);
      return {
        profile,
        contribution,
        result: computePayroll(profile, contribution),
      };
    }),
  );
}
