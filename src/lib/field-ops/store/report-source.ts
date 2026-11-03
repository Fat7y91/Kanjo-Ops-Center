import { listVisitReportRows } from "@/lib/field-ops/reports-repository";
import type { VisitReport } from "@/lib/field-ops/types";

import { clone, getStore } from "./core";

/**
 * Single read seam for visit reports.
 *
 * Durable rows come from `app.visit_reports`; the process-local store is only
 * used while the migration is not deployed, so a deployment without the table
 * still renders the demo timeline instead of an empty card. Keeping the
 * fallback here means the visit store and the CRM roll-up cannot disagree
 * about which source they read.
 *
 * Pass a `merchantId` to let the database narrow the read — the profile page
 * only ever needs one merchant's history.
 */
export async function loadVisitReports(
  merchantId?: string,
): Promise<VisitReport[]> {
  const durable = await listVisitReportRows(merchantId);
  // The store is cloned before sorting: it is process-wide state and the sort
  // would otherwise reorder it for every other request in this isolate.
  const seed = getStore().reports;
  const reports =
    durable ??
    clone(
      merchantId
        ? seed.filter((report) => report.merchantId === merchantId)
        : seed,
    );
  return reports.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}
