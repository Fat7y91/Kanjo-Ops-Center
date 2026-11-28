import type { ZonePoint } from "@/lib/field-ops/types";

/**
 * Small shared plumbing for the field-ops domain.
 *
 * Every durable collection now lives in SQL (see `20261110000000_field_ops_catalogue.sql`
 * and `20261102000005_visit_reports.sql`). What remains here is the error type,
 * the actor shape, and the small pure helpers the repositories and stores both
 * use. There is no process-local store any more: a Worker isolate is not a
 * database, and pretending otherwise is what made a city disappear on refresh.
 */

export class FieldOpsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "FieldOpsError";
    this.code = code;
    this.status = status;
  }
}

export type Actor = {
  id: string;
  name: string;
  team: string;
};

export function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function isoNow(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

export function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function zone(points: Array<[number, number]>): ZonePoint[] {
  return points.map(([lat, lng]) => ({ lat, lng }));
}
