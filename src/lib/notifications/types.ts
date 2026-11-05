import { z } from "zod";

/**
 * Operator inbox vocabulary (`app.notifications`).
 *
 * A row with `user_id = NULL` is a broadcast: it is visible to every active
 * operator and read-state is per viewer (see the repository, which tracks
 * per-viewer acknowledgement separately from the row). A row with a `user_id`
 * belongs to exactly one operator.
 */

/**
 * Executive rank that also opens the inbox.
 *
 * The capability (`view_notifications`) is checked first and is the primary
 * gate; this rank only widens access so a deployment whose grant table runs
 * behind the code cannot lock an owner out of their own notifications. Shared
 * by the API guard, the page guard and the topbar bell so they cannot disagree.
 */
export const NOTIFICATIONS_CLEARANCE = 3;

export type Notification = {
  id: string;
  userId: string | null;
  title: string;
  body: string;
  icon: string;
  color: string;
  kind: string;
  taskId: string | null;
  link: string;
  isRead: boolean;
  readAt: string | null;
  occurredAt: string;
  createdAt: string;
};

/** Create a broadcast (`userId` null) or a targeted notification. */
export const notificationInputSchema = z.object({
  userId: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1, "عنوان الإشعار مطلوب.").max(160),
  body: z.string().trim().max(2000).default(""),
  icon: z.string().trim().max(40).default(""),
  color: z.string().trim().max(40).default(""),
  kind: z.string().trim().max(40).default("system"),
  taskId: z.string().trim().max(120).nullable().default(null),
  link: z.string().trim().max(500).default(""),
  occurredAt: z.string().datetime().optional(),
});

export type NotificationInput = z.infer<typeof notificationInputSchema>;

export const NOTIFICATION_KIND_META: Record<string, { label: string; tone: string }> = {
  system: { label: "نظام", tone: "" },
  task: { label: "مهمة", tone: "badge-gold" },
  finance: { label: "مالية", tone: "badge-green" },
  alert: { label: "تنبيه", tone: "badge-red" },
};

export function notificationKindMeta(kind: string): { label: string; tone: string } {
  return NOTIFICATION_KIND_META[kind] ?? { label: kind || "نظام", tone: "" };
}
