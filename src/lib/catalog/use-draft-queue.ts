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
 *
 * Sync is manual-only by design. Drafts are written locally and stay in
 * IndexedDB/localStorage indefinitely until the rep presses "رفع الكل الآن";
 * there is no polling, no reconnect auto-flush and no background timer, so a
 * rep can always review local work before it reaches the live server. The only
 * background work here is a lightweight re-read of local storage so the banner
 * reflects drafts written from another tab.
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

    // Connectivity only drives the banner copy. It never triggers a sync.
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

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
