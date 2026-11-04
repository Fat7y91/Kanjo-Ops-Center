import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { FieldTask, FollowUpKind, FollowUpTask } from "./types";

/**
 * Tier 4 repository for `app.field_tasks` and `app.follow_up_tasks`.
 *
 * Both tables were created by `20261110000000_field_ops_catalogue.sql`. They
 * are the durable half of the field-ops board: before this, a scheduled visit
 * lived only in the Worker isolate that received it.
 */

const TASK_COLUMNS =
  "id,merchant_id,merchant_name,team,city_id,visit_date,target_commission,strategic_notes,instructions,status,follow_up_kind,follow_up_contact_number,created_by,created_by_name,created_at";

const FOLLOW_UP_COLUMNS =
  "id,merchant_id,merchant_name,team,city_id,visit_date,due_at,kind,note,contact_number,status,created_by,created_by_name,created_at,source_report_id";

type TaskRow = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  team: string;
  city_id: string;
  visit_date: string;
  target_commission: number | string;
  strategic_notes: string;
  instructions: string;
  status: FieldTask["status"];
  follow_up_kind: FollowUpKind | null;
  follow_up_contact_number: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
};

type FollowUpRow = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  team: string;
  city_id: string;
  visit_date: string;
  due_at: string;
  kind: FollowUpKind;
  note: string;
  contact_number: string | null;
  status: FollowUpTask["status"];
  created_by: string;
  created_by_name: string;
  created_at: string;
  source_report_id: string | null;
};

function toTask(row: TaskRow): FieldTask {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    team: row.team,
    cityId: row.city_id,
    visitDate: row.visit_date,
    targetCommission: Number(row.target_commission ?? 0),
    strategicNotes: row.strategic_notes,
    instructions: row.instructions,
    status: row.status,
    followUpKind: row.follow_up_kind,
    followUpContactNumber: row.follow_up_contact_number,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function toFollowUp(row: FollowUpRow): FollowUpTask {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    team: row.team,
    cityId: row.city_id,
    visitDate: row.visit_date,
    dueAt: row.due_at,
    kind: row.kind,
    note: row.note,
    contactNumber: row.contact_number,
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    sourceReportId: row.source_report_id,
  };
}

export function isFieldTasksDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/** All scheduled/completed visits, newest schedule first. */
export async function listTaskRows(): Promise<FieldTask[]> {
  if (!isFieldTasksDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("field_tasks")
    .select(TASK_COLUMNS)
    .order("visit_date", { ascending: true });

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as TaskRow[]).map(toTask);
}

export async function getTaskRow(taskId: string): Promise<FieldTask | null> {
  if (!isFieldTasksDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("field_tasks")
    .select(TASK_COLUMNS)
    .eq("id", taskId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return data ? toTask(data as unknown as TaskRow) : null;
}

export async function insertTask(task: FieldTask): Promise<FieldTask> {
  requireDatabase();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("field_tasks")
    .insert({
      id: task.id,
      merchant_id: task.merchantId,
      merchant_name: task.merchantName,
      team: task.team,
      city_id: task.cityId,
      visit_date: task.visitDate,
      target_commission: task.targetCommission,
      strategic_notes: task.strategicNotes,
      instructions: task.instructions,
      status: task.status,
      follow_up_kind: task.followUpKind ?? null,
      follow_up_contact_number: task.followUpContactNumber ?? null,
      created_by: task.createdBy,
      created_by_name: task.createdByName,
      created_at: task.createdAt,
    })
    .select(TASK_COLUMNS)
    .single();

  if (error) throw error;
  return toTask(data as unknown as TaskRow);
}

export async function completeTaskRow(taskId: string): Promise<void> {
  if (!isFieldTasksDatabaseConfigured()) return;
  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from("field_tasks")
    .update({ status: "completed" })
    .eq("id", taskId);
  if (error && !isMissingSchemaObject(error)) throw error;
}

/** Reassign every scheduled task of a merchant after an ownership transfer. */
export async function reassignTasksForMerchant(
  merchantId: string,
  team: string,
): Promise<void> {
  if (!isFieldTasksDatabaseConfigured()) return;
  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from("field_tasks")
    .update({ team })
    .eq("merchant_id", merchantId)
    .eq("status", "scheduled");
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function listFollowUpRows(
  merchantId?: string,
): Promise<FollowUpTask[]> {
  if (!isFieldTasksDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  let query = client
    .schema("app")
    .from("follow_up_tasks")
    .select(FOLLOW_UP_COLUMNS)
    .order("due_at", { ascending: false });
  if (merchantId) query = query.eq("merchant_id", merchantId);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as FollowUpRow[]).map(toFollowUp);
}

export async function insertFollowUp(task: FollowUpTask): Promise<FollowUpTask> {
  requireDatabase();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("follow_up_tasks")
    .insert({
      id: task.id,
      merchant_id: task.merchantId,
      merchant_name: task.merchantName,
      team: task.team,
      city_id: task.cityId,
      visit_date: task.visitDate,
      due_at: task.dueAt,
      kind: task.kind,
      note: task.note,
      contact_number: task.contactNumber ?? null,
      status: task.status,
      created_by: task.createdBy,
      created_by_name: task.createdByName,
      created_at: task.createdAt,
      source_report_id: task.sourceReportId,
    })
    .select(FOLLOW_UP_COLUMNS)
    .single();

  if (error) throw error;
  return toFollowUp(data as unknown as FollowUpRow);
}

function requireDatabase(): void {
  if (!isFieldTasksDatabaseConfigured()) {
    throw new Error("FIELD_TASKS_UNAVAILABLE: the task database is not connected");
  }
}
