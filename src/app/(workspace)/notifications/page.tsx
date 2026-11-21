import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import { listInbox } from "@/lib/notifications/repository";
import type { Notification } from "@/lib/notifications/types";
import { InboxView } from "./components/inbox-view";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * The operator inbox.
 *
 * Rows are the viewer's own notifications plus every broadcast. Read state for
 * a broadcast is per viewer, so two operators cannot clear each other's unread
 * badge.
 *
 * A failed read renders an error with a retry, not an "inbox not enabled"
 * placeholder: the route always asks the database for real rows.
 */
export default async function NotificationsPage() {
  const session = await requireModuleAccess("/notifications");

  let items: Notification[] = [];
  let failure = "";
  try {
    items = await listInbox(session.user.id);
  } catch (error) {
    console.error("[notifications] inbox read failed", error);
    failure = "تعذر تحميل الإشعارات. أعد المحاولة بعد قليل.";
  }

  const unread = items.filter((item) => !item.isRead).length;

  return (
    <>
      <PageHeader
        eyebrow="مساحة العمل"
        title="الإشعارات"
        description="التنبيهات الموجهة إليك وإعلانات الإدارة العامة. تعليم إشعار عام كمقروء يخصّك وحدك."
        actions={
          <span className={`badge ${unread > 0 ? "badge-gold" : ""}`.trim()}>
            {unread > 0 ? `${unread} غير مقروء` : "لا جديد"}
          </span>
        }
      />

      <InboxView
        initialItems={items}
        errorMessage={failure}
        currentUserId={session.user.id}
      />
    </>
  );
}

