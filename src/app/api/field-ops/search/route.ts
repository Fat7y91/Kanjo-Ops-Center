import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth/api";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { loadMerchantVisitCounts } from "@/lib/field-ops/state-source";
import { loadVisitReports } from "@/lib/field-ops/store/report-source";
import { searchMerchants } from "@/lib/search/merchant-search";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Global merchant search for the Visit Engine.
 *
 * Deliberately searches the ENTIRE merchant database within the rep's city
 * scope, not just today's assigned tasks, so a rep can start an unplanned
 * visit for any merchant on the fly.
 */
export async function GET(request: Request) {
  const { session, response } = await authorize("view_all_teams_visits");
  if (!session) return response;

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const matches = await searchMerchants(
    query,
    session.user.team,
    20,
    effectiveCityIds(session),
  );
  // Visit counts come pre-aggregated from the rollup. The report scan below is
  // the demo-mode fallback, where the store only holds a handful of rows.
  const counts =
    (await loadMerchantVisitCounts()) ??
    (await countReportsByMerchant());
  const results = matches.map((result) => ({
    ...result,
    visitCount: counts.get(result.merchant.id) ?? 0,
  }));

  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function countReportsByMerchant(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const report of await loadVisitReports()) {
    counts.set(report.merchantId, (counts.get(report.merchantId) ?? 0) + 1);
  }
  return counts;
}
