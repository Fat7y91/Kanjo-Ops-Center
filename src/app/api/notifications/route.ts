import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import {
  insertNotification,
  markAllRead,
  markNotificationRead,
} from "@/lib/notifications/mutations";
import { countUnread, listInbox } from "@/lib/notifications/repository";
import { notificationInputSchema } from "@/lib/notifications/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** The signed-in operator's inbox: own notifications plus every broadcast. */
export async function GET() {
  const { session, response } = await authorize("view_notifications");
  if (!session) return response;

  try {
    const items = (await listInbox(session.user.id)) ?? [];
    return NextResponse.json(
      { items, unread: items.filter((item) => !item.isRead).length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Marks notifications read for the caller.
 *
 * Body: `{ id }` for one, or `{ all: true }` for the whole inbox. The viewer id
 * always comes from the session, so a request can never mark another operator's
 * notification read.
 */
export async function PATCH(request: Request) {
  const { session, response } = await authorize("view_notifications");
  if (!session) return response;

  const body = (await readJson(request)) as { id?: unknown; all?: unknown };

  try {
    if (body.all === true) {
      await markAllRead(session.user.id);
    } else if (typeof body.id === "string" && body.id.length > 0) {
      await markNotificationRead(body.id, session.user.id);
    } else {
      return NextResponse.json(
        { error: "حدّد إشعاراً أو اطلب تعليم الكل كمقروء." },
        { status: 422 },
      );
    }

    return NextResponse.json({ unread: await countUnread(session.user.id) });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Broadcasts a notification.
 *
 * Gated by `view_notifications` because there is no separate "send" capability
 * in V1; the audience is the operator set, and the row is owner-less so every
 * active account sees it. A targeted notification names a recipient.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("view_notifications");
  if (!session) return response;

  try {
    const input = notificationInputSchema.parse(await readJson(request));
    const notification = await insertNotification({ ...input });
    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
