"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  flushDrafts,
  readDrafts,
  type CatalogDraft,
  type DraftFlushOutcome,
} from "@/lib/catalog/draft-queue";

/**
 * React binding: exposes the queue contents, connectivity, and a manual flush.
 * Auto-flushes when connectivity returns and every 30s while work is pending.
 */
export function useCatalogDraftQueue() {
  const [drafts, setDrafts] = useState<CatalogDraft[]>([]);
  const [online, setOnline] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastOutcome, setLastOutcome] = useState<DraftFlushOutcome | null>(null);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    setDrafts(await readDrafts());
  }, []);

  const flush = useCallback(async () => {
    if (syncingRef.current) return null;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const outcome = await flushDrafts();
      setLastOutcome(outcome);
      await refresh();
      return outcome;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    void refresh();

    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const timer = window.setInterval(() => {
      void refresh();
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void flush();
      }
    }, 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, [flush, refresh]);

  return {
    drafts,
    count: drafts.length,
    online,
    syncing,
    lastOutcome,
    flush,
    refresh,
  };
}
