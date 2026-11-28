import type { Notification } from "./types";

/**
 * Row shapes for `app.notifications`.
 *
 * The canonical column set lives in
 * `supabase/migrations/20261112000000_legacy_gap_resolutions.sql`, but a
 * deployment can reach production with a table created by hand in the SQL
 * editor, so the reader selects `*` and normalises whatever arrives instead of
 * projecting a fixed column list. A row only needs an `id` to render;
 * everything else falls back to a safe default so one missing column cannot
 * empty the whole inbox.
 */

export type NotificationRow = Record<string, unknown>;

export const DEFAULT_NOTIFICATION_KIND = "system";

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function optionalText(value: unknown): string | null {
  const value_ = text(value);
  return value_.length > 0 ? value_ : null;
}

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "number") {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber.toISOString();
  }
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isTrue(value: unknown): boolean {
  return value === true || value === "true" || value === "t" || value === 1;
}

/**
 * Normalises one row. `null` means the row cannot identify itself (no `id`) and
 * must be dropped rather than keyed by an empty string.
 *
 * Read state: a targeted row carries `is_read` / `read_at`; a broadcast
 * (`user_id` null) is read only when this viewer has an acknowledgement row.
 */
export function toNotification(
  row: NotificationRow,
  readAck: Map<string, string>,
): Notification | null {
  const id = text(row.id);
  if (id.length === 0) return null;

  const userId = optionalText(row.user_id);
  const broadcast = userId === null;
  const ackAt = readAck.get(id) ?? null;
  const rowReadAt = isoOrNull(row.read_at);
  const occurredAt =
    isoOrNull(row.occurred_at) ??
    isoOrNull(row.created_at) ??
    new Date().toISOString();
  const createdAt = isoOrNull(row.created_at) ?? occurredAt;

  return {
    id,
    userId,
    title: text(row.title),
    body: text(row.body),
    icon: text(row.icon),
    color: text(row.color),
    kind: text(row.kind) || DEFAULT_NOTIFICATION_KIND,
    taskId: optionalText(row.task_id),
    link: text(row.link),
    isRead: broadcast ? ackAt !== null : isTrue(row.is_read) || rowReadAt !== null,
    readAt: broadcast ? ackAt : rowReadAt,
    occurredAt,
    createdAt,
  };
}

export function mapNotificationRows(
  rows: NotificationRow[],
  readAck: Map<string, string>,
): Notification[] {
  const mapped: Notification[] = [];
  for (const row of rows) {
    const notification = toNotification(row, readAck);
    if (notification) mapped.push(notification);
  }
  return mapped;
}

/** Newest first, without depending on the database having ordered the rows. */
export function sortByRecency(items: Notification[]): Notification[] {
  return [...items].sort(
    (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
  );
}
