import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { listInbox } from "./repository";
import { toNotification, type NotificationRow } from "./rows";
import {
  READ_TIMEOUT_MS,
  UUID,
  rethrow,
  storeUnavailable,
} from "./store";
import type { Notification } from "./types";

/**
 * Tier 4 writes over `app.notifications` and `app.notification_reads`.
 *
 * A targeted row flips its own `is_read`; a broadcast records an acknowledgement
 * for the calling viewer only, so one operator marking it read never clears
 * another operator's badge. Every write receives the viewer id from the session,
 * never from the request body.
 */

/** Flips `is_read` on rows this viewer owns; degrades when `read_at` is absent. */
async function patchTargeted(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0) return;

  const client = getSupabaseServerClient();
  const full = await client
    .schema("app")
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", userId);

  if (!full.error) return;
  if (!isMissingSchemaObject(full.error)) rethrow(full.error);

  // A hand-made table may carry `is_read` without `read_at`.
  const minimal = await client
    .schema("app")
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids)
    .eq("user_id", userId);

  if (minimal.error) {
    if (isMissingSchemaObject(minimal.error)) throw storeUnavailable();
    rethrow(minimal.error);
  }
}

/** Records this viewer's acknowledgement of broadcasts, one row per notification. */
async function upsertAcks(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0) return;

  const readAt = new Date().toISOString();
  const { error } = await getSupabaseServerClient()
    .schema("app")
    .from("notification_reads")
    .upsert(
      ids.map((id) => ({
        notification_id: id,
        user_id: userId,
        read_at: readAt,
      })),
      { onConflict: "notification_id,user_id" },
    );

  if (error && !isMissingSchemaObject(error)) rethrow(error);
}

/**
 * Marks one notification read for this viewer.
 *
 * A malformed id and an id the viewer cannot see are both no-ops, so a stale
 * client can never 500 the route.
 */
export async function markNotificationRead(
  id: string,
  userId: string,
): Promise<void> {
  if (!UUID.test(id)) return;

  const { data, error } = await getSupabaseServerClient()
    .schema("app")
    .from("notifications")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) throw storeUnavailable();
    rethrow(error);
  }
  if (!data) return;

  const owner = (data as { user_id: string | null }).user_id;
  if (owner === userId) await patchTargeted([id], userId);
  else if (owner === null) await upsertAcks([id], userId);
}

/**
 * Marks every unread row visible to this viewer as read.
 *
 * Two statements, not one per row: owned notifications in a single `UPDATE`,
 * broadcasts in a single `upsert`. A 200-row inbox would otherwise take 600
 * round trips and time the route out.
 */
export async function markAllRead(userId: string): Promise<void> {
  const unread = (await listInbox(userId)).filter((item) => !item.isRead);
  if (unread.length === 0) return;

  await patchTargeted(
    unread.filter((item) => item.userId === userId).map((item) => item.id),
    userId,
  );
  await upsertAcks(
    unread.filter((item) => item.userId === null).map((item) => item.id),
    userId,
  );
}

/**
 * Appends one notification (targeted when `userId` is set, otherwise a
 * broadcast). Falls back to the three required columns when the table is
 * narrower than the canonical shape.
 */
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

  const canonical: Record<string, unknown> = {
    user_id: row.userId,
    title: row.title,
    body: row.body,
    icon: row.icon,
    color: row.color,
    kind: row.kind,
    task_id: row.taskId,
    link: row.link,
  };
  if (row.occurredAt) canonical.occurred_at = row.occurredAt;

  const required: Record<string, unknown> = {
    user_id: row.userId,
    title: row.title,
    body: row.body,
  };
  if (row.occurredAt) required.occurred_at = row.occurredAt;

  for (const payload of [canonical, required]) {
    const { data, error } = await client
      .schema("app")
      .from("notifications")
      .insert(payload)
      .select("*")
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
      .single();

    if (!error) {
      const created = toNotification(data as NotificationRow, new Map());
      if (!created) throw storeUnavailable();
      return created;
    }
    if (!isMissingSchemaObject(error)) rethrow(error);
    if (payload === required) throw storeUnavailable();
  }

  throw storeUnavailable();
}
