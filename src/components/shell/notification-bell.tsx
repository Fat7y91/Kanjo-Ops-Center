"use client";

import { usePermission } from "@/components/auth/use-permission";
import { NotificationPanel } from "@/components/shell/notification-panel";
import { useNotificationFeed } from "@/components/shell/use-notification-feed";
import { PopoverMenu } from "@/components/ui/popover-menu";
import { NOTIFICATIONS_CLEARANCE } from "@/lib/notifications/types";

/**
 * Topbar bell.
 *
 * The badge is the caller's unread count across their own notifications and
 * every broadcast. It renders for an operator holding `view_notifications` or
 * for the executive tier (L3+), which mirrors the API guard exactly: a grant is
 * checked first, and rank only widens access for a deployment whose grant table
 * runs behind the code.
 */
export function NotificationBell() {
  const { hasPermission, clearanceLevel } = usePermission();
  const enabled =
    hasPermission("view_notifications") ||
    clearanceLevel >= NOTIFICATIONS_CLEARANCE;
  const { items, unread, busy, markOne, markAll } = useNotificationFeed(enabled);

  if (!enabled) return null;

  return (
    <PopoverMenu
      trigger={
        <span className="notification-bell">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 8.6a6 6 0 1 0-12 0c0 4.4-1.8 5.7-1.8 5.7h15.6S18 13 18 8.6Z" />
            <path d="M10.3 18.2a2 2 0 0 0 3.4 0" />
          </svg>
          {unread > 0 ? (
            <span className="notification-bell-badge" aria-hidden="true">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </span>
      }
      triggerLabel={
        unread > 0 ? `الإشعارات — ${unread} غير مقروء` : "الإشعارات"
      }
      buttonClassName="notification-bell-trigger"
    >
      {(close) => (
        <NotificationPanel
          items={items}
          unread={unread}
          busy={busy}
          onMarkOne={(id) => void markOne(id)}
          onMarkAll={() => void markAll()}
          onNavigate={close}
        />
      )}
    </PopoverMenu>
  );
}
