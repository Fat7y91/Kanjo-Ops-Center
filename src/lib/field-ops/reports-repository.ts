import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject, isUniqueViolation } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { VisitReport } from "./types";

/**
 * Durable store for `app.visit_reports`.
 *
 * `app.visit_reports` is the shared, cross-isolate record of a completed visit.
 * Before it existed, a report acknowledged by one worker was invisible to the
 * next. Reads come from the table; writes go here before the route
 * acknowledges the report.
 *
 * This is the only module that knows the column names.
 */

const COLUMNS =
  "id,merchant_id,merchant_name,task_id,rep_id,rep_name,team,outcome,previous_state,notes,commission_amount,agreed_commission,created_at,started_at,ended_at,duration_seconds,start_location,end_location,contact,opinions,follow_up_at,follow_up_task_id,follow_up_contact_number,source,client_visit_id,logged_by";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VisitReportRow = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  task_id: string | null;
  rep_id: string;
  rep_name: string;
  team: string;
  outcome: VisitReport["outcome"];
  previous_state: VisitReport["previousState"];
  notes: string;
  commission_amount: number | string;
  agreed_commission: number | string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  start_location: VisitReport["startLocation"];
  end_location: VisitReport["endLocation"];
  contact: VisitReport["contact"];
  opinions: VisitReport["opinions"];
  follow_up_at: string | null;
  follow_up_task_id: string | null;
  follow_up_contact_number: string | null;
  source: VisitReport["source"] | null;
  client_visit_id: string | null;
  logged_by: string | null;
};

export type VisitReportPersistResult = "stored" | "duplicate" | "unavailable";

export function isVisitReportsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function toReport(row: VisitReportRow): VisitReport {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    taskId: row.task_id,
    repId: row.rep_id,
    repName: row.rep_name,
    team: row.team,
    outcome: row.outcome,
    previousState: row.previous_state,
    notes: row.notes,
    commissionAmount: Number(row.commission_amount),
    agreedCommission:
      row.agreed_commission == null ? null : Number(row.agreed_commission),
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    startLocation: row.start_location,
    endLocation: row.end_location,
    contact: row.contact,
    opinions: Array.isArray(row.opinions) ? row.opinions : [],
    followUpAt: row.follow_up_at,
    followUpTaskId: row.follow_up_task_id,
    followUpContactNumber: row.follow_up_contact_number,
    source: row.source ?? "task",
    clientVisitId: row.client_visit_id,
  };
}

/**
 * Seeded field-ops actors use ids like `u-rep-fox`, which are not rows in
 * `app.users`. `logged_by` is a uuid FK, so anything else is sent as null
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
 * Durable reports, newest first, optionally narrowed to one merchant.
 *
 * Returns `null` when the table is not deployed yet, which the callers treat as
 * an empty timeline rather than a fabricated one.
 *
 * The merchant filter is applied by the database: loading the whole table and
 * filtering in JavaScript is what made the profile page pay for the entire
 * visit history of the network.
 */
export async function listVisitReportRows(
  merchantId?: string,
): Promise<VisitReport[] | null> {
  if (!hasSupabaseConfig()) return null;

  const client = getSupabaseServerClient();
  const base = client
    .schema("app")
    .from("visit_reports")
    .select(COLUMNS)
    .order("created_at", { ascending: false });

  const { data, error } = merchantId
    ? await base.eq("merchant_id", merchantId)
    : await base.limit(5000);

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return ((data ?? []) as VisitReportRow[]).map(toReport);
}

/**
 * Merchant ids and display names seen in the visit history.
 *
 * Some field-ops merchants were captured in `app.visit_reports` but never made
 * it into `app.merchants` (the V1 seed catalogue). Their history still makes
 * them legitimate drafting targets, but their name lives only on the report.
 * Selecting two small columns and de-duplicating in memory is cheaper than a
 * per-id round trip.
 *
 * Pass `merchantIds` to narrow the read to the handful of ids that need a name.
 */
export async function listVisitMerchantNames(
  merchantIds?: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!hasSupabaseConfig()) return names;
  if (merchantIds && merchantIds.length === 0) return names;

  const client = getSupabaseServerClient();
  let query = client
    .schema("app")
    .from("visit_reports")
    .select("merchant_id,merchant_name,created_at")
    .order("created_at", { ascending: false });
  if (merchantIds) query = query.in("merchant_id", [...merchantIds]);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaObject(error)) return names;
    throw error;
  }

  for (const row of (data ?? []) as Array<{
    merchant_id: string;
    merchant_name: string | null;
  }>) {
    if (!names.has(row.merchant_id)) {
      names.set(row.merchant_id, row.merchant_name ?? "");
    }
  }
  return names;
}

/**
 * Persists one report.
 *
 * `unavailable` means the migration is not deployed yet and the caller must
 * fail the request instead of pretending the write landed.
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
