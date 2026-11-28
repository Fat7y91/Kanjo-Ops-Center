import "server-only";

import {
  deleteAttendance as deleteAttendanceRow,
  listAttendance,
  upsertAttendance,
  type CourierAttendanceRecord,
} from "./attendance-repository";
import { CouriersError } from "./errors";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "./tiered-pay";

/**
 * Tier 3 rules for courier attendance overrides.
 *
 * Attendance is a plain daily flag: present pays the fixed 165 EGP amount,
 * absent/excused does not. Order tiers are derived from the operations log and
 * are not affected by this toggle. Input is validated here so a bad date never
 * reaches Postgres.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireDay(value: unknown): string {
  const day = typeof value === "string" ? value.trim() : "";
  if (!DAY_PATTERN.test(day)) {
    throw new CouriersError("INVALID_DAY", "أدخل تاريخاً صالحاً للحضور.", 422);
  }
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new CouriersError("INVALID_DAY", "أدخل تاريخاً صالحاً للحضور.", 422);
  }
  return day;
}

function requireStatus(value: unknown): AttendanceStatus {
  if (typeof value !== "string" || !ATTENDANCE_STATUSES.includes(value as AttendanceStatus)) {
    throw new CouriersError("INVALID_STATUS", "حالة الحضور غير صالحة.", 422);
  }
  return value as AttendanceStatus;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireCourierId(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new CouriersError("NOT_FOUND", "مندوب التوصيل غير موجود.", 404);
  }
  return id;
}

export async function loadAttendance(
  courierId: string,
): Promise<CourierAttendanceRecord[]> {
  return listAttendance(requireCourierId(courierId));
}

export async function saveAttendance(
  courierId: string,
  rawInput: unknown,
  createdBy: string | null,
): Promise<CourierAttendanceRecord> {
  const input =
    typeof rawInput === "object" && rawInput !== null
      ? (rawInput as { day?: unknown; status?: unknown; note?: unknown })
      : {};
  return upsertAttendance({
    courierId: requireCourierId(courierId),
    day: requireDay(input.day),
    status: requireStatus(input.status),
    note:
      typeof input.note === "string" ? input.note.trim().slice(0, 500) : "",
    createdBy,
  });
}

export async function clearAttendance(
  courierId: string,
  day: unknown,
): Promise<void> {
  await deleteAttendanceRow(requireCourierId(courierId), requireDay(day));
}
