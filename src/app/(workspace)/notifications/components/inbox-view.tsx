"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/field-ops/format";
import {
  notificationKindMeta,
  type Notification,
} from "@/lib/notifications/types";

type InboxViewProps = {
  initialItems: Notification[];
  errorMessage?: string;
  currentUserId: string;
};

/**
 * Client inbox.
 *
 * Marking read goes through the API so the per-viewer acknowledgement for a
 * broadcast is persisted. The optimistic local flip only affects this viewer's
 * render; a failed request restores the row.
 */
export function InboxView({
  initialItems,
  errorMessage = "",
  currentUserId,
}: InboxViewProps) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unread = items.filter((item) => !item.isRead).length;

  async function markOne(id: string) {
    setError("");
    const before = items;
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, isRead: true, readAt: new Date().toISOString() }
          : item,
      ),
    );
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        setItems(before);
        setError("تعذر تعليم الإشعار كمقروء.");
      }
    } catch {
      setItems(before);
      setError("تعذر الاتصال بالخادم.");
    }
  }

  async function markAll() {
    setBusy(true);
    setError("");
    const before = items;
    setItems((current) =>
      current.map((item) => ({ ...item, isRead: true })),
    );
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) {
        setItems(before);
        setError("تعذر تعليم الكل كمقروء.");
      }
    } catch {
      setItems(before);
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  if (errorMessage) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>تعذر تحميل الإشعارات</h2>
        </div>
        <p className="muted">{errorMessage}</p>
        <div className="row-actions">
          <Button size="sm" variant="quiet" onClick={() => router.refresh()}>
            إعادة المحاولة
          </Button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="panel-head">
        <h2>صندوق الوارد</h2>
        <div className="row-actions">
          <Button
            size="sm"
            variant="quiet"
            disabled={busy || unread === 0}
            onClick={markAll}
          >
            {busy ? "جارٍ التعليم…" : "تعليم الكل كمقروء"}
          </Button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {items.length === 0 ? (
        <p className="empty-state">لا توجد إشعارات بعد.</p>
      ) : (
        <ul className="feed-list">
          {items.map((item) => {
            const meta = notificationKindMeta(item.kind);
            const targeted = item.userId === currentUserId;
            return (
              <li
                key={item.id}
                className={`feed-item${item.isRead ? "" : " is-unread"}`}
              >
                <div className="feed-item-body">
                  <div className="feed-item-head">
                    <strong>{item.title}</strong>
                    <span className={`badge ${meta.tone}`.trim()}>
                      {targeted ? meta.label : "عام"}
                    </span>
                  </div>
                  {item.body ? (
                    <p className="feed-item-text">{item.body}</p>
                  ) : null}
                  <div className="feed-item-meta">
                    <span>{formatDateTime(item.occurredAt)}</span>
                    {!targeted ? <span>إعلان عام</span> : null}
                  </div>
                  <div className="feed-item-actions">
                    {item.link ? (
                      <Link
                        className="button button-small button-quiet"
                        href={item.link}
                      >
                        فتح
                      </Link>
                    ) : null}
                    {!item.isRead ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markOne(item.id)}
                      >
                        تعليم كمقروء
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
