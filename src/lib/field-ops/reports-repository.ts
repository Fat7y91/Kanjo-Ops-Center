import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject, isUniqueViolation } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { VisitReport } from "./types";

/**
 * Durable write target for `app.visit_reports`.
 *
 * The field-ops read path still comes from the process-local store; this seam
 * only makes sure a report that was acknowledged survives an isolate recycle.
 * It is also the only module that knows the column names.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VisitReportPersistResult = "stored" | "duplicate" | "unavailable";

export function isVisitReportsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/**
 * Seeded field-ops actors use ids like `u-rep-fox`, which are not rows in
 * `app.users`. `logged_by` is a uuid FK, so anything else must be sent as null
 * rather than rejected by the database.
 */
function loggedByValue(actorId: string | null): string | null {
  return actorId && UUID.test(actorId) ? actorId : null;
}

function toRow(report: VisitReport, loggedBy: string | null) {
  return {
    id: report.id,
    merchant_id: report.merchantId,
    merchant_name: report.merchantName,
    task_id: report.taskId,
    rep_id: report.repId,
    rep_name: report.repName,
    team: report.team,
    outcome: report.outcome,
    previous_state: report.previousState,
    notes: report.notes,
    commission_amount: report.commissionAmount,
    agreed_commission: report.agreedCommission ?? null,
    created_at: report.createdAt,
    started_at: report.startedAt ?? null,
    ended_at: report.endedAt ?? null,
    duration_seconds: report.durationSeconds ?? null,
    start_location: report.startLocation ?? null,
    end_location: report.endLocation ?? null,
    contact: report.contact ?? null,
    opinions: report.opinions ?? [],
    follow_up_at: report.followUpAt ?? null,
    follow_up_task_id: report.followUpTaskId ?? null,
    follow_up_contact_number: report.followUpContactNumber ?? null,
    source: report.source ?? "task",
    client_visit_id: report.clientVisitId ?? null,
    logged_by: loggedByValue(loggedBy),
  };
}

/**
 * Persists one report.
 *
 * `unavailable` means the migration is not deployed yet, so the route keeps
 * serving the in-memory copy and the deployment converges after the migration.
 * `duplicate` means an offline replay already stored this `client_visit_id`.
 * Every other error is thrown, so a write is never silently dropped.
 */
export async function persistVisitReport(
  report: VisitReport,
  loggedBy: string | null,
): Promise<VisitReportPersistResult> {
  if (!isVisitReportsDatabaseConfigured()) return "unavailable";

  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from("visit_reports")
    .insert(toRow(report, loggedBy));

  if (!error) return "stored";
  if (isUniqueViolation(error)) return "duplicate";
  if (isMissingSchemaObject(error)) return "unavailable";
  throw error;
}
