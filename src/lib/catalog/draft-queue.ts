"use client";

import { createClientId } from "@/lib/catalog/sku";
import type {
  CatalogProductType,
  CatalogProductState,
  CatalogVariantSelection,
} from "@/lib/catalog/types";

/**
 * Offline-first draft queue for catalog products.
 *
 * Strategy (mirrors the visit queue so field reps only learn one mental model):
 *  1. Every saved product lands here first, online or offline. The server is
 *     never the first write, so a dropped connection cannot lose a draft.
 *  2. IndexedDB is primary (image data URLs blow past localStorage quotas);
 *     localStorage is a transparent fallback for private-mode browsers.
 *  3. `clientProductId` is generated on the client and echoed by the server,
 *     which makes batch replays idempotent.
 *  4. On sync, entries are removed only when the server reports `synced` or
 *     `duplicate`; failures stay queued with attempt count + last error.
 */

export type CatalogDraftPayload = {
  name: string;
  description: string;
  merchantId: string;
  merchantName: string;
  vendorTypeId: number | null;
  categoryKey: string | null;
  productType: CatalogProductType;
  sku: string;
  barcode: string;
  imageDataUrl: string | null;
  attributes: CatalogVariantSelection[];
  price: number;
  state: CatalogProductState;
  reviewNote: string;
};

export type CatalogDraft = {
  clientProductId: string;
  payload: CatalogDraftPayload;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
};

const DB_NAME = "kanjo-catalog-queue";
const DB_VERSION = 1;
const STORE = "drafts";
const LS_KEY = "kanjo_v2_catalog_drafts";

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
        db.createObjectStore(STORE, { keyPath: "clientProductId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("db-open-failed"));
  });
}

function readFallback(): CatalogDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CatalogDraft[]) : [];
  } catch {
    return [];
  }
}

function writeFallback(items: CatalogDraft[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // Both stores exhausted: the caller surfaces the failure to the rep.
  }
}

async function idbGetAll(): Promise<CatalogDraft[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () =>
      resolve((request.result ?? []) as CatalogDraft[]);
    request.onerror = () =>
      reject(request.error ?? new Error("idb-read-failed"));
  });
}

async function idbPut(item: CatalogDraft): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb-write-failed"));
  });
}

async function idbDelete(clientProductId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(clientProductId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb-delete-failed"));
  });
}

export async function readDrafts(): Promise<CatalogDraft[]> {
  try {
    const items = await idbGetAll();
    const merged = new Map<string, CatalogDraft>();
    for (const item of [...readFallback(), ...items]) {
      merged.set(item.clientProductId, item);
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

export async function enqueueDraft(
  payload: CatalogDraftPayload,
): Promise<CatalogDraft> {
  const item: CatalogDraft = {
    clientProductId: createClientId(),
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };

  try {
    await idbPut(item);
  } catch {
    writeFallback([...readFallback(), item]);
  }

  return item;
}

export async function removeDraft(clientProductId: string): Promise<void> {
  try {
    await idbDelete(clientProductId);
  } catch {
    // Fall through to the localStorage mirror below.
  }
  writeFallback(
    readFallback().filter((entry) => entry.clientProductId !== clientProductId),
  );
}

async function markDraftFailure(
  clientProductId: string,
  message: string,
): Promise<void> {
  const items = await readDrafts();
  const existing = items.find(
    (item) => item.clientProductId === clientProductId,
  );
  if (!existing) return;
  const updated: CatalogDraft = {
    ...existing,
    attempts: existing.attempts + 1,
    lastError: message,
  };
  try {
    await idbPut(updated);
  } catch {
    writeFallback(
      readFallback().map((entry) =>
        entry.clientProductId === clientProductId ? updated : entry,
      ),
    );
  }
}

type SyncResponse = {
  results?: Array<{
    clientProductId: string | null;
    status: "synced" | "duplicate" | "failed";
    error?: string;
  }>;
  error?: string;
};

export type DraftFlushOutcome = {
  synced: number;
  failed: number;
  remaining: number;
};

export async function flushDrafts(): Promise<DraftFlushOutcome> {
  const pending = await readDrafts();
  if (pending.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { synced: 0, failed: 0, remaining: pending.length };
  }

  let response: Response;
  try {
    response = await fetch("/api/catalog/products/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drafts: pending.map((item) => ({
          clientProductId: item.clientProductId,
          ...item.payload,
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
      await markDraftFailure(
        item.clientProductId,
        payload?.error ?? "sync failed",
      );
    }
    return { synced: 0, failed: pending.length, remaining: pending.length };
  }

  const byId = new Map(
    (payload?.results ?? []).map((result) => [
      result.clientProductId ?? "",
      result,
    ]),
  );

  let synced = 0;
  let failed = 0;
  for (const item of pending) {
    const result = byId.get(item.clientProductId);
    if (!result) {
      failed += 1;
      continue;
    }
    if (result.status === "synced" || result.status === "duplicate") {
      synced += 1;
      await removeDraft(item.clientProductId);
    } else {
      failed += 1;
      await markDraftFailure(
        item.clientProductId,
        result.error ?? "sync failed",
      );
    }
  }

  const remaining = (await readDrafts()).length;
  return { synced, failed, remaining };
}
