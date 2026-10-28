"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Durable offline queue for completed field visits.
 *
 * Strategy:
 *  1. Primary store is IndexedDB (large reports, structured data, survives
 *     quota pressure far better than localStorage).
 *  2. If IndexedDB is unavailable (private mode, old browser), we transparently
 *     fall back to localStorage so a rep never loses a captured visit.
 *  3. Flush happens on `online`, on an interval, and on demand. Entries are
 *     removed only after the server acknowledges them, and `clientVisitId`
 *     makes replays idempotent.
 */

export type QueuedVisitPayload = {
  outcome: string;
  notes: string;
  taskId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  startLocation?: unknown;
  endLocation?: unknown;
  contact?: unknown;
  opinions?: Array<{ trait: string; weight: number; label?: string }>;
  agreedCommission?: number | null;
  followUpAt?: string | null;
  followUpKind?: "visit" | "call" | "whatsapp";
  followUpNote?: string;
  followUpContactNumber?: string | null;
  source?: "task" | "unplanned" | "offline";
  clientVisitId?: string | null;
};

export type QueuedVisit = {
  clientVisitId: string;
  merchantId: string;
  merchantName: string;
  payload: QueuedVisitPayload;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
};

const DB_NAME = "kanjo-visit-queue";
const DB_VERSION = 1;
const STORE = "visits";
const LS_KEY = "kanjo_v2_visit_queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb-unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientVisitId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("db-open-failed"));
  });
}

function readFallback(): QueuedVisit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedVisit[]) : [];
  } catch {
    return [];
  }
}

function writeFallback(items: QueuedVisit[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // Nothing more we can do if both stores are full.
  }
}

async function idbGetAll(): Promise<QueuedVisit[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result ?? []) as QueuedVisit[]);
    request.onerror = () => reject(request.error ?? new Error("idb-read-failed"));
  });
}

async function idbPut(item: QueuedVisit): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb-write-failed"));
  });
}

async function idbDelete(clientVisitId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(clientVisitId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb-delete-failed"));
  });
}

export async function readQueue(): Promise<QueuedVisit[]> {
  try {
    const items = await idbGetAll();
    // Reconcile anything written to the fallback while IDB was unavailable.
    const fallback = readFallback();
    const merged = new Map<string, QueuedVisit>();
    for (const item of [...fallback, ...items]) {
      merged.set(item.clientVisitId, item);
    }
    return Array.from(merged.values()).sort((left, right) =>
      left.queuedAt.localeCompare(right.queuedAt),
    );
  } catch {
    return readFallback().sort((left, right) =>
      left.queuedAt.localeCompare(right.queuedAt),
    );
  }
}

export async function enqueueVisit(
  input: Omit<QueuedVisit, "queuedAt" | "attempts" | "lastError">,
): Promise<QueuedVisit> {
  const item: QueuedVisit = {
    ...input,
    clientVisitId: input.clientVisitId,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };

  try {
    await idbPut(item);
  } catch {
    const current = readFallback();
    writeFallback([
      ...current.filter((entry) => entry.clientVisitId !== item.clientVisitId),
      item,
    ]);
  }

  return item;
}

export async function removeFromQueue(clientVisitId: string): Promise<void> {
  try {
    await idbDelete(clientVisitId);
  } catch {
    // Fall through to the localStorage mirror below.
  }
  writeFallback(
    readFallback().filter((entry) => entry.clientVisitId !== clientVisitId),
  );
}

export async function markQueueFailure(
  clientVisitId: string,
  message: string,
): Promise<void> {
  const items = await readQueue();
  const existing = items.find((item) => item.clientVisitId === clientVisitId);
  if (!existing) return;
  const updated: QueuedVisit = {
    ...existing,
    attempts: existing.attempts + 1,
    lastError: message,
  };
  try {
    await idbPut(updated);
  } catch {
    writeFallback(
      readFallback().map((entry) =>
        entry.clientVisitId === clientVisitId ? updated : entry,
      ),
    );
  }
}

type SyncResponse = {
  synced?: number;
  failed?: number;
  results?: Array<{
    clientVisitId: string | null;
    status: "synced" | "duplicate" | "failed";
    error?: string;
  }>;
  error?: string;
};

export type FlushOutcome = {
  synced: number;
  failed: number;
  remaining: number;
};

export async function flushQueue(): Promise<FlushOutcome> {
  const pending = await readQueue();
  if (pending.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { synced: 0, failed: 0, remaining: pending.length };
  }

  let response: Response;
  try {
    response = await fetch("/api/field-ops/visits/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visits: pending.map((item) => ({
          merchantId: item.merchantId,
          payload: item.payload,
        })),
      }),
    });
  } catch {
    return { synced: 0, failed: 0, remaining: pending.length };
  }

  let payload: SyncResponse | null = null;
  try {
    payload = (await response.json()) as SyncResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    for (const item of pending) {
      await markQueueFailure(item.clientVisitId, payload?.error ?? "sync failed");
    }
    return { synced: 0, failed: pending.length, remaining: pending.length };
  }

  const byId = new Map(
    (payload?.results ?? []).map((result) => [
      result.clientVisitId ?? "",
      result,
    ]),
  );

  let synced = 0;
  let failed = 0;
  for (const item of pending) {
    const result = byId.get(item.clientVisitId);
    if (!result) {
      // Server replied but omitted this entry: keep it queued for the retry.
      failed += 1;
      continue;
    }
    if (result.status === "synced" || result.status === "duplicate") {
      synced += 1;
      await removeFromQueue(item.clientVisitId);
    } else {
      failed += 1;
      await markQueueFailure(item.clientVisitId, result.error ?? "sync failed");
    }
  }

  const remaining = (await readQueue()).length;
  return { synced, failed, remaining };
}

/**
 * React binding for the queue: exposes counts, online state and a manual flush.
 * Auto-flushes when connectivity returns and every 30s while work is pending.
 */
export function useVisitQueue() {
  const [pending, setPending] = useState<number>(0);
  const [online, setOnline] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastOutcome, setLastOutcome] = useState<FlushOutcome | null>(null);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const items = await readQueue();
    setPending(items.length);
  }, []);

  const flush = useCallback(async () => {
    if (syncingRef.current) return null;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const outcome = await flushQueue();
      setLastOutcome(outcome);
      await refreshCount();
      return outcome;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    void refreshCount();

    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const timer = window.setInterval(() => {
      void refreshCount();
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void flush();
      }
    }, 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, [flush, refreshCount]);

  return { pending, online, syncing, lastOutcome, flush, refreshCount };
}
