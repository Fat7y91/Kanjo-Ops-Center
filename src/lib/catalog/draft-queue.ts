"use client";

import {
  deleteDraft,
  putDraft,
  readDrafts,
} from "@/lib/catalog/draft-storage";
import type {
  CatalogDraft,
  CatalogDraftPayload,
  DraftFlushOutcome,
} from "@/lib/catalog/draft-types";
import { createClientId } from "@/lib/catalog/sku";

export type {
  CatalogDraft,
  CatalogDraftPayload,
  DraftFlushOutcome,
} from "@/lib/catalog/draft-types";
export { readDrafts, deleteDraft as removeDraft } from "@/lib/catalog/draft-storage";

/**
 * Offline-first draft queue for catalog products.
 *
 * Strategy (mirrors the visit queue so field reps only learn one mental model):
 *  1. Every saved product lands here first, online or offline. The server is
 *     never the first write, so a dropped connection cannot lose a draft.
 *  2. Drafts persist indefinitely until the rep explicitly uploads them; see
 *     `use-draft-queue.ts`, which intentionally has no timers or listeners.
 *  3. `clientProductId` is generated on the client and echoed by the server,
 *     which makes batch replays idempotent.
 *  4. Sync is manual-only: entries are removed only when the rep presses the
 *     upload button and the server reports `synced` or `duplicate`; failures
 *     stay queued with attempt count + last error.
 */

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

  await putDraft(item);
  return item;
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
  await putDraft({
    ...existing,
    attempts: existing.attempts + 1,
    lastError: message,
  });
}

type SyncResponse = {
  results?: Array<{
    clientProductId: string | null;
    status: "synced" | "duplicate" | "failed";
    error?: string;
  }>;
  error?: string;
};

export async function flushDrafts(): Promise<DraftFlushOutcome> {
  const pending = await readDrafts();
  if (pending.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { synced: 0, failed: 0, remaining: pending.length };
  }

  // Drafts queued before the category became mandatory cannot be uploaded.
  // They are flagged locally instead of poisoning the whole batch, because one
  // invalid draft must never block the rep's other work.
  const sendable: CatalogDraft[] = [];
  let invalid = 0;
  for (const item of pending) {
    if (!item.payload.categoryId) {
      invalid += 1;
      await markDraftFailure(
        item.clientProductId,
        "التصنيف مطلوب — أعد إدخال المسودة بتصنيف صحيح.",
      );
      continue;
    }
    sendable.push(item);
  }

  if (sendable.length === 0) {
    return { synced: 0, failed: invalid, remaining: pending.length };
  }

  let response: Response;
  try {
    response = await fetch("/api/catalog/products/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drafts: sendable.map((item) => ({
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
    for (const item of sendable) {
      await markDraftFailure(
        item.clientProductId,
        payload?.error ?? "sync failed",
      );
    }
    return {
      synced: 0,
      failed: sendable.length + invalid,
      remaining: pending.length,
    };
  }

  const byId = new Map(
    (payload?.results ?? []).map((result) => [
      result.clientProductId ?? "",
      result,
    ]),
  );

  let synced = 0;
  let failed = invalid;
  for (const item of sendable) {
    const result = byId.get(item.clientProductId);
    if (!result) {
      failed += 1;
      continue;
    }
    if (result.status === "synced" || result.status === "duplicate") {
      synced += 1;
      await deleteDraft(item.clientProductId);
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
