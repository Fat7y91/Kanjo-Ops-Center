"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/field-ops/format";
import {
  notificationKindMeta,
  type Notification,
} from "@/lib/notifications/types";

type NotificationPanelProps = {
  items: Notification[];
  unread: number;
  busy: boolean;
  onMarkOne: (id: string) => void;
  onMarkAll: () => void;
  /** Closes the popover; called once a row or the footer link is chosen. */
  onNavigate: () => void;
};

const PREVIEW_LIMIT = 6;

/**
 * Bell dropdown body: the newest rows plus the two bulk actions.
 *
 * Opening a row marks it read for this viewer and closes the panel, so the
 * badge and the inbox agree after a single click.
 */
export function NotificationPanel({
  items,
  unread,
  busy,
  onMarkOne,
  onMarkAll,
  onNavigate,
}: NotificationPanelProps) {
  const preview = items.slice(0, PREVIEW_LIMIT);

  return (
    <div className="notification-pop">
      <div className="notification-pop-head">
        <strong>الإشعارات</strong>
        <span className={`badge${unread > 0 ? " badge-gold" : ""}`.trim()}>
          {unread > 0 ? `${unread} غير مقروء` : "لا جديد"}
        </span>
      </div>

      {preview.length === 0 ? (
        <p className="notification-pop-empty">لا توجد إشعارات بعد.</p>
      ) : (
        <ul className="notification-pop-list">
          {preview.map((item) => {
            const meta = notificationKindMeta(item.kind);
            return (
              <li
                key={item.id}
                className={`notification-pop-row${item.isRead ? "" : " is-unread"}`}
              >
                <Link
                  className="notification-pop-link"
                  href={item.link || "/notifications"}
                  onClick={() => {
                    if (!item.isRead) onMarkOne(item.id);
                    onNavigate();
                  }}
                >
                  <span className="notification-pop-dot" aria-hidden="true" />
                  <span className="notification-pop-copy">
                    <span className="notification-pop-title">
                      {item.title}
                    </span>
                    {item.body ? (
                      <span className="notification-pop-text">{item.body}</span>
                    ) : null}
                    <span className="notification-pop-meta">
                      <span className={`badge ${meta.tone}`.trim()}>
                        {meta.label}
                      </span>
                      <span>{formatDateTime(item.occurredAt)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="notification-pop-foot">
        <Link
          className="notification-pop-all"
          href="/notifications"
          onClick={onNavigate}
        >
          عرض كل الإشعارات
        </Link>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || unread === 0}
          onClick={onMarkAll}
        >
          {busy ? "جارٍ التعليم…" : "تعليم الكل كمقروء"}
        </Button>
      </div>
    </div>
  );
}
