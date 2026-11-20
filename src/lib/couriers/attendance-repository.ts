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

export async function upsertAttendance(
  input: AttendanceWrite,
): Promise<CourierAttendanceRecord> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("courier_attendance")
    .upsert(
      {
        courier_id: input.courierId,
        attendance_date: input.day,
        status: input.status,
        note: input.note,
        created_by: input.createdBy,
      },
      { onConflict: "courier_id,attendance_date" },
    )
    .select(ATTENDANCE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("تعذر حفظ حضور مندوب التوصيل.");
  }
  return toRecord(data as AttendanceRow);
}

export async function deleteAttendance(
  courierId: string,
  day: string,
): Promise<void> {
  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from("courier_attendance")
    .delete()
    .eq("courier_id", courierId)
    .eq("attendance_date", day);

  if (error) throw error;
}
