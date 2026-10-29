"use client";

/**
 * Deprecated alias — the catalog draft queue now lives in
 * `src/lib/catalog/offline-queue.ts` (Tier 4 data access).
 *
 * Kept as a re-export so existing components resolve to one implementation.
 * New code must import from `offline-queue` directly.
 */

export {
  enqueueDraft,
  enqueueDrafts,
  flushDrafts,
  readDrafts,
  removeDraft,
  type CatalogDraft,
  type CatalogDraftPayload,
  type DraftFlushOutcome,
} from "@/lib/catalog/offline-queue";
