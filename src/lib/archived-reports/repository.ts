import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isQueryTimeout,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { GovernanceError, fromDatabaseError } from "@/lib/governance/errors";

import type { ArchivedReport } from "./types";

/**
 * Tier 4 repository for `app.archived_reports`.
 *
 * Archiving is a move, not a delete: the live `app.visit_reports` history is
 * append-only, so the archive holds the snapshot the operator pulled out of the
 * timeline plus the reason. Restoring removes the archive row only.
 */

const READ_TIMEOUT_MS = 6_000;
const LIST_LIMIT = 200;

const COLUMNS =
  "id,task_id,merchant_id,task_name,report,archived_by,archived_by_name,reason,occurred_at,created_at";

type ArchivedReportRow = {
  id: string;
  task_id: string | null;
  merchant_id: string;
  task_name: string;
  report: Record<string, unknown> | null;
  archived_by: string | null;
  archived_by_name: string;
  reason: string;
  occurred_at: string;
  created_at: string;
};

export function isArchivedReportsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function toArchivedReport(row: ArchivedReportRow): ArchivedReport {
  return {
    id: row.id,
    taskId: row.task_id,
    merchantId: row.merchant_id,
    taskName: row.task_name,
    report: row.report ?? {},
    archivedBy: row.archived_by,
    archivedByName: row.archived_by_name,
    reason: row.reason,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

/** The archive, newest first. `null` when the table is not deployed. */
export async function listArchivedReports(
  limit: number = LIST_LIMIT,
): Promise<ArchivedReport[] | null> {
  if (!isArchivedReportsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("archived_reports")
    .select(COLUMNS)
    .order("occurred_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, LIST_LIMIT)))
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    if (isQueryTimeout(error)) {
      throw new Error(
        "ARCHIVED_REPORTS_TIMEOUT: the archive read exceeded its deadline",
      );
    }
    throw error;
  }

  return ((data ?? []) as ArchivedReportRow[]).map(toArchivedReport);
}

/** Appends one archive entry. */
export async function insertArchivedReport(row: {
  taskId: string | null;
  merchantId: string;
  taskName: string;
  report: Record<string, unknown>;
  archivedBy: string | null;
  archivedByName: string;
  reason: string;
  occurredAt?: string;
}): Promise<ArchivedReport> {
  const client = getSupabaseServerClient();
  const insert: Record<string, unknown> = {
    task_id: row.taskId,
    merchant_id: row.merchantId,
    task_name: row.taskName,
    report: row.report,
    archived_by: row.archivedBy,
    archived_by_name: row.archivedByName,
    reason: row.reason,
  };
  if (row.occurredAt) insert.occurred_at = row.occurredAt;

  const { data, error } = await client
    .schema("app")
    .from("archived_reports")
    .insert(insert)
    .select(COLUMNS)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new GovernanceError(
        "STORE_UNAVAILABLE",
        "أرشيف التقارير غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    const mapped = fromDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
  return toArchivedReport(data as ArchivedReportRow);
}

/** Restores (removes the archive row). Returns false when it did not exist. */
export async function deleteArchivedReport(id: string): Promise<boolean> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("archived_reports")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw error;
  return (data ?? []).length > 0;
}
