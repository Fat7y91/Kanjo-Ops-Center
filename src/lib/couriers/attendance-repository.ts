import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { AttendanceStatus } from "./tiered-pay";

/**
 * Persistence for courier attendance overrides.
 *
 * Only the exceptions an operator decided by hand live here; a day with a
 * delivered order is auto-attended and never needs a row. One row per courier
 * per Cairo calendar day, upserted on the natural key.
 */

export type CourierAttendanceRecord = {
  id: string;
  courierId: string;
  day: string;
  status: AttendanceStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
};

type AttendanceRow = {
  id: string;
  courier_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  note: string;
  created_at: string;
  updated_at: string;
};

const ATTENDANCE_COLUMNS =
  "id,courier_id,attendance_date,status,note,created_at,updated_at";

function toRecord(row: AttendanceRow): CourierAttendanceRecord {
  return {
    id: row.id,
    courierId: row.courier_id,
    day: row.attendance_date,
    status: row.status,
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAttendance(
  courierId: string,
): Promise<CourierAttendanceRecord[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("courier_attendance")
    .select(ATTENDANCE_COLUMNS)
    .eq("courier_id", courierId)
    .order("attendance_date", { ascending: false })
    .limit(1000);

  if (error) throw error;
  return ((data ?? []) as AttendanceRow[]).map(toRecord);
}

export type AttendanceWrite = {
  courierId: string;
  day: string;
  status: AttendanceStatus;
  note: string;
  createdBy: string | null;
};

/**
 * The override and its 165 EGP journal entry are written by one Postgres
 * function, so a manually marked present day is paid everywhere in the same
 * transaction (and never double-posts if an order lands later that day).
 */
export async function upsertAttendance(
  input: AttendanceWrite,
): Promise<CourierAttendanceRecord> {
  const client = getSupabaseServerClient();
  const { data, error } = await client.schema("app").rpc("save_courier_attendance", {
    p_courier_id: input.courierId,
    p_day: input.day,
    p_status: input.status,
    p_note: input.note,
    p_created_by: input.createdBy,
  });

  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as AttendanceRow | null;
  if (!row) {
    throw new Error("تعذر حفظ حضور مندوب التوصيل.");
  }
  return toRecord(row);
}

export async function deleteAttendance(
  courierId: string,
  day: string,
): Promise<void> {
  const client = getSupabaseServerClient();
  const { error } = await client.schema("app").rpc("delete_courier_attendance", {
    p_courier_id: courierId,
    p_day: day,
  });

  if (error) throw error;
}
