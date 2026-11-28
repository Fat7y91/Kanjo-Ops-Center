"use client";

import { useCallback, useRef, useState } from "react";

import { needsMirroring } from "@/lib/catalog/images/hosted";
import {
  mirrorImagesPayloadSchema,
  type MirrorItemResult,
} from "@/lib/catalog/mirror-payload";
import type { CatalogProduct } from "@/lib/catalog/types";

const BATCH_SIZE = 5;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1500;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

export type MirrorStage = "idle" | "running" | "paused" | "done";

export type MirrorCounts = {
  mirrored: number;
  alreadyHosted: number;
  failed: number;
  total: number;
};

export type MirrorFailure = { id: string; name: string; reason: string };

type Options = {
  merchantId: string;
  onMirrored: (productId: string, url: string) => void;
};

const EMPTY_COUNTS: MirrorCounts = {
  mirrored: 0,
  alreadyHosted: 0,
  failed: 0,
  total: 0,
};

class BatchError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drives a mirror run from the browser: five products per request, transient
 * 502/503/504 retried, with pause/resume/cancel and a retry-only-the-failures
 * path. Product state is updated in place through `onMirrored`, so the Excel
 * export sees the new URLs without a reload.
 */
export function useCatalogMirror({ merchantId, onMirrored }: Options) {
  const [stage, setStage] = useState<MirrorStage>("idle");
  const [counts, setCounts] = useState<MirrorCounts>(EMPTY_COUNTS);
  const [failures, setFailures] = useState<MirrorFailure[]>([]);
  const [error, setError] = useState("");

  const countsRef = useRef<MirrorCounts>(EMPTY_COUNTS);
  const failuresRef = useRef<MirrorFailure[]>([]);
  const queueRef = useRef<string[]>([]);
  const namesRef = useRef(new Map<string, string>());
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);
  const runningRef = useRef(false);
  const merchantRef = useRef(merchantId);
  merchantRef.current = merchantId;
  const onMirroredRef = useRef(onMirrored);
  onMirroredRef.current = onMirrored;

  const applyResults = useCallback((results: MirrorItemResult[]) => {
    const next = { ...countsRef.current };
    const nextFailures = [...failuresRef.current];

    for (const result of results) {
      if (result.status === "mirrored" && result.url) {
        next.mirrored += 1;
        onMirroredRef.current(result.id, result.url);
        const index = nextFailures.findIndex((item) => item.id === result.id);
        if (index !== -1) nextFailures.splice(index, 1);
      } else if (result.status === "already_hosted") {
        next.alreadyHosted += 1;
      } else {
        next.failed += 1;
        nextFailures.push({
          id: result.id,
          name: result.name || namesRef.current.get(result.id) || "منتج",
          reason: result.reason || "تعذر توطين الصورة.",
        });
      }
    }

    countsRef.current = next;
    failuresRef.current = nextFailures;
    setCounts(next);
    setFailures(nextFailures);
  }, []);

  const postBatch = useCallback(
    async (ids: string[]): Promise<MirrorItemResult[]> => {
      let lastError: unknown = new BatchError("تعذر توطين الصور.");
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
          const response = await fetch("/api/catalog/mirror-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              merchantId: merchantRef.current,
              productIds: ids,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(120_000),
          });
          if (response.ok) {
            return mirrorImagesPayloadSchema.parse(await response.json())
              .results;
          }
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          const message = payload.error ?? "تعذر توطين الصور.";
          if (!RETRYABLE_STATUS.has(response.status)) {
            throw new BatchError(message);
          }
          lastError = new BatchError(message);
        } catch (caught) {
          if (caught instanceof BatchError) throw caught;
          lastError = caught;
        }
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_MS * (attempt + 1));
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("تعذر توطين الصور.");
    },
    [],
  );

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStage("running");
    try {
      while (queueRef.current.length > 0) {
        if (cancelledRef.current) break;
        if (pausedRef.current) {
          setStage("paused");
          return;
        }

        const batch = queueRef.current.splice(0, BATCH_SIZE);
        let results: MirrorItemResult[];
        try {
          results = await postBatch(batch);
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "تعذر توطين الصور.";
          setError(message);
          results = batch.map((id) => ({
            id,
            name: namesRef.current.get(id) ?? "",
            status: "failed" as const,
            reason: message,
          }));
        }

        applyResults(results);

        if (cancelledRef.current) break;
        if (pausedRef.current) {
          setStage("paused");
          return;
        }
      }
      setStage(cancelledRef.current ? "idle" : "done");
    } finally {
      runningRef.current = false;
    }
  }, [applyResults, postBatch]);

  const start = useCallback(
    (products: CatalogProduct[]) => {
      if (runningRef.current) return;
      const pending = products.filter((product) =>
        needsMirroring(product.imageDataUrl),
      );
      namesRef.current = new Map(
        products.map((product) => [product.id, product.name]),
      );
      countsRef.current = {
        mirrored: 0,
        alreadyHosted: products.length - pending.length,
        failed: 0,
        total: pending.length,
      };
      failuresRef.current = [];
      queueRef.current = pending.map((product) => product.id);
      pausedRef.current = false;
      cancelledRef.current = false;
      setCounts(countsRef.current);
      setFailures([]);
      setError("");
      if (pending.length === 0) {
        setStage("done");
        return;
      }
      void drain();
    },
    [drain],
  );

  const pause = useCallback(() => {
    if (!runningRef.current) return;
    pausedRef.current = true;
    setStage("paused");
  }, []);

  const resume = useCallback(() => {
    if (queueRef.current.length === 0 && failuresRef.current.length === 0) {
      return;
    }
    pausedRef.current = false;
    cancelledRef.current = false;
    void drain();
  }, [drain]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    pausedRef.current = false;
    if (!runningRef.current) setStage("idle");
  }, []);

  const retryFailed = useCallback(() => {
    if (
      runningRef.current ||
      queueRef.current.length > 0 ||
      failuresRef.current.length === 0
    ) {
      return;
    }
    const ids = failuresRef.current.map((failure) => failure.id);
    countsRef.current = {
      ...countsRef.current,
      failed: Math.max(0, countsRef.current.failed - ids.length),
    };
    failuresRef.current = [];
    queueRef.current = ids;
    pausedRef.current = false;
    cancelledRef.current = false;
    setCounts(countsRef.current);
    setFailures([]);
    setError("");
    void drain();
  }, [drain]);

  const reset = useCallback(() => {
    if (runningRef.current) return;
    countsRef.current = EMPTY_COUNTS;
    failuresRef.current = [];
    queueRef.current = [];
    setCounts(EMPTY_COUNTS);
    setFailures([]);
    setError("");
    setStage("idle");
  }, []);

  return {
    stage,
    counts,
    failures,
    error,
    start,
    pause,
    resume,
    cancel,
    retryFailed,
    reset,
  };
}
