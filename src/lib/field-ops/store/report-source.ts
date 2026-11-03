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
 */
export async function loadVisitReports(): Promise<VisitReport[]> {
  const durable = await listVisitReportRows();
  const reports = durable ?? clone(getStore().reports);
  return reports.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}
