import "server-only";

import { listVisitReports } from "@/lib/field-ops/store";
import { loadBiMerchantFacts, type BiMerchantFact } from "./repository";

/**
 * Report-derived per-merchant facts for the overview.
 *
 * Preferred source: `app.bi_merchant_rollup`, one pre-computed row per
 * merchant. Only when that view is not deployed does this fall back to a single
 * pass over the durable report table, which keeps local dev and CI working
 * without re-introducing the per-merchant scans on Edge.
 */

export type MerchantFacts = Map<string, BiMerchantFact>;

export async function loadMerchantFacts(): Promise<MerchantFacts> {
  const rollup = await loadBiMerchantFacts();
  if (rollup) return rollup;

  return deriveFromReports(await listVisitReports());
}

function deriveFromReports(
  reports: Awaited<ReturnType<typeof listVisitReports>>,
): MerchantFacts {
  const facts: MerchantFacts = new Map();
  const latestVisitAt = new Map<string, string>();
  const latestNegotiationAt = new Map<string, string>();

  const ensure = (merchantId: string): BiMerchantFact => {
    const current = facts.get(merchantId);
    if (current) return current;
    const created: BiMerchantFact = {
      visitedAt: null,
      repId: null,
      repName: null,
      negotiatedCommission: null,
    };
    facts.set(merchantId, created);
    return created;
  };

  for (const report of reports) {
    const entry = ensure(report.merchantId);
    const at = report.createdAt;

    const previousVisit = latestVisitAt.get(report.merchantId);
    if (!previousVisit || at > previousVisit) {
      latestVisitAt.set(report.merchantId, at);
      entry.visitedAt = at;
      entry.repId = report.repId;
      entry.repName = report.repName;
    }

    if (report.agreedCommission != null) {
      const previousDeal = latestNegotiationAt.get(report.merchantId);
      if (!previousDeal || at > previousDeal) {
        latestNegotiationAt.set(report.merchantId, at);
        entry.negotiatedCommission = report.agreedCommission;
      }
    }
  }

  return facts;
}
