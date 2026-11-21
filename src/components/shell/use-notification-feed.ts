"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Notification } from "@/lib/notifications/types";

/**
 * Topbar bell state.
 *
 * The bell is a live surface: it loads the caller's inbox on mount, refreshes
 * every minute while the tab is visible, and refetches on focus so a badge is
 * never stale after an operator returns to the tab. Read state is optimistic —
 * the server response is the source of truth, so a rejected PATCH reloads the
 * list instead of quietly disagreeing with the database.
 */

const POLL_MS = 60_000;

export type NotificationFeed = {
  items: Notification[];
  unread: number;
  busy: boolean;
  markOne: (id: string) => Promise<void>;
  markAll: () => Promise<void>;
  refresh: () => void;
};

export function useNotificationFeed(enabled: boolean): NotificationFeed {
  const [items, setItems] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { items?: unknown };
      if (!active.current) return;
      setItems(Array.isArray(payload.items) ? (payload.items as Notification[]) : []);
    } catch {
      // Keep the last known list; the next poll retries.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    void load();

    const reload = () => {
      if (document.visibilityState === "visible") void load();
    };

    const timer = window.setInterval(reload, POLL_MS);
    document.addEventListener("visibilitychange", reload);
    window.addEventListener("focus", reload);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", reload);
      window.removeEventListener("focus", reload);
    };
  }, [enabled, load]);

  const markOne = useCallback(
    async (id: string) => {
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
        if (!response.ok) await load();
      } catch {
        await load();
      }
    },
    [load],
  );

  const markAll = useCallback(async () => {
    setBusy(true);
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) await load();
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return {
    items,
    unread: items.filter((item) => !item.isRead).length,
    busy,
    markOne,
    markAll,
    refresh,
  };
}
