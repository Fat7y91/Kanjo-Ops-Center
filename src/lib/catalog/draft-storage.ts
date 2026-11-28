"use client";

import type { CatalogDraft } from "@/lib/catalog/draft-types";

/**
 * Persistence layer for the catalog draft queue.
 *
 * IndexedDB is primary because image data URLs blow past localStorage quotas;
 * localStorage is a transparent fallback for private-mode browsers. Nothing
 * here schedules work: this module only reads and writes local storage.
 */

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

export async function putDraft(item: CatalogDraft): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb-write-failed"));
    });
  } catch {
    writeFallback([
      ...readFallback().filter(
        (entry) => entry.clientProductId !== item.clientProductId,
      ),
      item,
    ]);
  }
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

export async function deleteDraft(clientProductId: string): Promise<void> {
  try {
    await idbDelete(clientProductId);
  } catch {
    // Fall through to the localStorage mirror below.
  }
  writeFallback(
    readFallback().filter((entry) => entry.clientProductId !== clientProductId),
  );
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
