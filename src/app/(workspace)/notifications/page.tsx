import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import { listInbox } from "@/lib/notifications/repository";
import { InboxView } from "./components/inbox-view";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * The operator inbox.
 *
 * Rows are the viewer's own notifications plus every broadcast. Read state for
 * a broadcast is per viewer, so two operators cannot clear each other's unread
 * badge.
 */
export default async function NotificationsPage() {
  const session = await requireModuleAccess("/notifications");
  const items = await listInbox(session.user.id);

  const unavailable = items === null;
  const list = items ?? [];
  const unread = list.filter((item) => !item.isRead).length;

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
        initialItems={list}
        unavailable={unavailable}
        currentUserId={session.user.id}
      />
    </>
  );
}
