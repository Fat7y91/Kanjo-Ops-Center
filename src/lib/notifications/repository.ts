import "server-only";

import {
  isMissingSchemaObject,
  isQueryTimeout,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import {
  mapNotificationRows,
  sortByRecency,
  type NotificationRow,
} from "./rows";
import {
  READ_TIMEOUT_MS,
  isNotificationsDatabaseConfigured,
  rethrow,
  storeUnavailable,
} from "./store";
import type { Notification } from "./types";

/**
 * Tier 4 reads over `app.notifications`.
 *
 * A targeted row (`user_id` set) carries its own read state. A broadcast
 * (`user_id IS NULL`) is visible to every active operator and its read state is
 * per viewer: acknowledgement lives in `app.notification_reads`, so one
 * operator dismissing it cannot clear it for everyone.
 *
 * Rows are selected with `*` and normalised in `./rows`, so a table created by
 * hand with fewer columns still renders. Only an absent table degrades the
 * surface, and it degrades with a real error the page can surface — never a
 * silent "feature not deployed" panel.
 */

const INBOX_LIMIT = 200;
const ACK_CHUNK = 50;

/**
 * Ordering candidates, tried in turn. `occurred_at` is canonical; a hand-made
 * table may only have `created_at`, and a table without either still renders
 * because `sortByRecency` orders in memory.
 */
const ORDER_COLUMNS: ReadonlyArray<string | null> = [
  "occurred_at",
  "created_at",
  null,
];

/**
 * The viewer's inbox rows (`*`), retried with a narrower ORDER BY when the
 * table lacks the canonical timestamp column.
 */
async function readRows(userId: string): Promise<NotificationRow[]> {
  const client = getSupabaseServerClient();

  for (const column of ORDER_COLUMNS) {
    const scoped = client
      .schema("app")
      .from("notifications")
      .select("*")
      .or(`user_id.eq.${userId},user_id.is.null`)
      .limit(INBOX_LIMIT)
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

    const { data, error } = await (column
      ? scoped.order(column, { ascending: false })
      : scoped);

    if (!error) return (data ?? []) as NotificationRow[];

    if (isQueryTimeout(error)) {
      throw new Error(
        "NOTIFICATIONS_TIMEOUT: the inbox read exceeded its deadline",
      );
    }
    if (!isMissingSchemaObject(error)) rethrow(error);
  }

  throw storeUnavailable();
}

/**
 * Per-viewer acknowledgement for broadcasts. Best effort: if
 * `app.notification_reads` is absent (older deployment) broadcasts simply
 * render unread instead of failing the inbox.
 */
async function readAcks(
  userId: string,
  broadcastIds: string[],
): Promise<Map<string, string>> {
  const acks = new Map<string, string>();
  if (broadcastIds.length === 0) return acks;

  const client = getSupabaseServerClient();

  // Chunked so a full inbox never builds a `?notification_id=in.(…)` URL long
  // enough to be rejected.
  for (let index = 0; index < broadcastIds.length; index += ACK_CHUNK) {
    const chunk = broadcastIds.slice(index, index + ACK_CHUNK);
    const { data, error } = await client
      .schema("app")
      .from("notification_reads")
      .select("notification_id,read_at")
      .eq("user_id", userId)
      .in("notification_id", chunk);

    if (error || !data) continue;
    for (const row of data as { notification_id: string; read_at: string }[]) {
      if (row?.notification_id) {
        acks.set(row.notification_id, row.read_at ?? new Date().toISOString());
      }
    }
  }

  return acks;
}

/**
 * The viewer's inbox: their own notifications plus every broadcast.
 *
 * Returns `[]` when Supabase is not configured at all; throws
 * `STORE_UNAVAILABLE` when the table itself is absent so the page can offer a
 * retry instead of claiming the feature is switched off.
 */
export async function listInbox(userId: string): Promise<Notification[]> {
  if (!isNotificationsDatabaseConfigured()) return [];

  const rows = await readRows(userId);
  const broadcastIds = rows
    .filter((row) => row.user_id === null || row.user_id === undefined)
    .map((row) => String(row.id ?? ""))
    .filter((id) => id.length > 0);

  const acks = await readAcks(userId, broadcastIds);
  return sortByRecency(mapNotificationRows(rows, acks));
}

/** Unread count for the topbar bell. Degrades to 0, never throws a page. */
export async function countUnread(userId: string): Promise<number> {
  const inbox = await listInbox(userId).catch(() => []);
  return inbox.filter((item) => !item.isRead).length;
}
