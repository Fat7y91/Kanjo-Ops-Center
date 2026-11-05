import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isQueryTimeout,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { GovernanceError, fromDatabaseError } from "@/lib/governance/errors";

import type { Notification } from "./types";

/**
 * Tier 4 repository for `app.notifications` and `app.notification_reads`.
 *
 * A targeted row (`user_id` set) carries its own read state. A broadcast
 * (`user_id IS NULL`) is visible to every active operator and its read state is
 * per viewer: acknowledgement lives in `app.notification_reads`, so one
 * operator dismissing it cannot clear it for everyone.
 *
 * Reads degrade to `null` when the migration is not deployed. Writes keep
 * strict errors.
 */

const READ_TIMEOUT_MS = 6_000;
const INBOX_LIMIT = 200;

const COLUMNS =
  "id,user_id,title,body,icon,color,kind,task_id,link,is_read,read_at,occurred_at,created_at";

type NotificationRow = {
  id: string;
  user_id: string | null;
  title: string;
  body: string;
  icon: string;
  color: string;
  kind: string;
  task_id: string | null;
  link: string;
  is_read: boolean;
  read_at: string | null;
  occurred_at: string;
  created_at: string;
};

export function isNotificationsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function toNotification(
  row: NotificationRow,
  readAck: Map<string, string>,
): Notification {
  const broadcast = row.user_id === null;
  const ackAt = readAck.get(row.id) ?? null;
  const isRead = broadcast ? ackAt !== null : row.is_read;
  const readAt = broadcast ? ackAt : row.read_at;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    icon: row.icon,
    color: row.color,
    kind: row.kind,
    taskId: row.task_id,
    link: row.link,
    isRead,
    readAt,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

/**
 * The viewer's inbox: their own notifications plus every broadcast.
 *
 * `null` means the table is not deployed. The read-acknowledgement lookup is
 * best-effort: if `notification_reads` is missing (older deployment) broadcasts
 * simply render unread.
 */
export async function listInbox(userId: string): Promise<Notification[] | null> {
  if (!isNotificationsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("notifications")
    .select(COLUMNS)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order("occurred_at", { ascending: false })
    .limit(INBOX_LIMIT)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    if (isQueryTimeout(error)) {
      throw new Error(
        "NOTIFICATIONS_TIMEOUT: the inbox read exceeded its deadline",
      );
    }
    throw error;
  }

  const rows = (data ?? []) as NotificationRow[];
  const broadcastIds = rows.filter((row) => row.user_id === null).map((row) => row.id);

  const readAck = new Map<string, string>();
  if (broadcastIds.length > 0) {
    const { data: acks, error: ackError } = await client
      .schema("app")
      .from("notification_reads")
      .select("notification_id,read_at")
      .eq("user_id", userId)
      .in("notification_id", broadcastIds)
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

    if (!ackError) {
      for (const ack of (acks ?? []) as Array<{
        notification_id: string;
        read_at: string;
      }>) {
        readAck.set(ack.notification_id, ack.read_at);
      }
    }
  }

  return rows.map((row) => toNotification(row, readAck));
}

/** Unread count for the topbar badge. Degrades to 0, never throws a page. */
export async function countUnread(userId: string): Promise<number> {
  const inbox = await listInbox(userId).catch(() => null);
  if (!inbox) return 0;
  return inbox.filter((item) => !item.isRead).length;
}

/**
 * Marks one notification read for this viewer.
 *
 * A targeted row flips its own `is_read`; a broadcast records an ack row. The
 * caller passes the viewer id, never the row owner, so a broadcast can only be
 * marked read by the operator doing the marking.
 */
export async function markNotificationRead(
  id: string,
  userId: string,
): Promise<void> {
  const client = getSupabaseServerClient();

  const { data, error } = await client
    .schema("app")
    .from("notifications")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return;

  const owner = (data as { user_id: string | null }).user_id;
  if (owner === userId) {
    const { error: updateError } = await client
      .schema("app")
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    if (updateError) throw updateError;
    return;
  }

  if (owner === null) {
    // Broadcast: record the acknowledgement for this viewer only.
    const { error: ackError } = await client
      .schema("app")
      .from("notification_reads")
      .upsert(
        { notification_id: id, user_id: userId, read_at: new Date().toISOString() },
        { onConflict: "notification_id,user_id" },
      );
    if (ackError && !isMissingSchemaObject(ackError)) throw ackError;
  }
}

/** Marks every unread row visible to this viewer as read. */
export async function markAllRead(userId: string): Promise<void> {
  const inbox = await listInbox(userId);
  if (!inbox) return;
  await Promise.all(
    inbox
      .filter((item) => !item.isRead)
      .map((item) => markNotificationRead(item.id, userId)),
  );
}

/** Appends one notification (targeted or broadcast). */
export async function insertNotification(row: {
  userId: string | null;
  title: string;
  body: string;
  icon: string;
  color: string;
  kind: string;
  taskId: string | null;
  link: string;
  occurredAt?: string;
}): Promise<Notification> {
  const client = getSupabaseServerClient();
  const insert: Record<string, unknown> = {
    user_id: row.userId,
    title: row.title,
    body: row.body,
    icon: row.icon,
    color: row.color,
    kind: row.kind,
    task_id: row.taskId,
    link: row.link,
  };
  if (row.occurredAt) insert.occurred_at = row.occurredAt;

  const { data, error } = await client
    .schema("app")
    .from("notifications")
    .insert(insert)
    .select(COLUMNS)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new GovernanceError(
        "STORE_UNAVAILABLE",
        "صندوق الإشعارات غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    const mapped = fromDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
  return toNotification(data as NotificationRow, new Map());
}
