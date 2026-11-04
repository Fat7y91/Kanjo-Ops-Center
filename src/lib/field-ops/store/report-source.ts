import { listVisitReportRows } from "@/lib/field-ops/reports-repository";
import type { VisitReport } from "@/lib/field-ops/types";

/**
 * Single read seam for visit reports.
 *
 * Durable rows come from `app.visit_reports`. There is no process-local
 * fallback: a deployment without the table reads an empty timeline, which is
 * the honest answer, rather than a fabricated demo history that would make the
 * profile card lie about a merchant nobody visited.
 *
 * Pass a `merchantId` to let the database narrow the read — the profile page
 * only ever needs one merchant's history.
 */
export async function loadVisitReports(
  merchantId?: string,
): Promise<VisitReport[]> {
  const reports = (await listVisitReportRows(merchantId)) ?? [];
  return reports.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}
