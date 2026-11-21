"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { postWithRetry } from "@/components/catalog/autopilot-http";
import {
  hasStockData,
  inStockItems,
} from "@/lib/catalog/autopilot/parse-pharmacy";
import { parsePosFile } from "@/lib/catalog/autopilot/workbook";
import type {
  AutopilotSummary,
  EnrichmentSource,
  ParsedPosSheet,
} from "@/lib/catalog/autopilot/types";

export type AutopilotStage =
  | "idle"
  | "parsing"
  | "ready"
  | "running"
  | "done"
  | "failed";

export type AutopilotProgress = {
  processed: number;
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  matchedMaster: number;
  enrichedWeb: number;
  reused: number;
  noImage: number;
};

type EnrichedItem = {
  id: string;
  imageDataUrl: string | null;
  imageUrlRaw: string | null;
  imageSource: EnrichmentSource;
  categoryKey: string;
  masterCatalogId: string | null;
};

type SaveResult = {
  inserted: number;
  updated: number;
  failed: number;
  failures?: { name: string; message: string }[];
};

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 300;
const PHARMACY_VENDOR_TYPE_ID = 3;
const FALLBACK_CATEGORY = "4-32";

const emptyProgress: AutopilotProgress = {
  processed: 0,
  total: 0,
  inserted: 0,
  updated: 0,
  failed: 0,
  matchedMaster: 0,
  enrichedWeb: 0,
  reused: 0,
  noImage: 0,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drives the client-side autopilot run: parse the workbook locally, send
 * small batches through enrichment, then persist each batch. Progress is kept
 * in React state so the modal can narrate `250 / 1745` while it works.
 *
 * Pharmacy workbooks are deduplicated by code/name because a POS repeats the
 * same drug once per batch/expiry, and the operator can drop zero-stock rows.
 */
export function useAutopilot(
  merchantId: string,
  vendorTypeId: number,
  onSaved: () => void,
): {
  stage: AutopilotStage;
  sheet: ParsedPosSheet | null;
  fileName: string;
  error: string;
  progress: AutopilotProgress;
  summary: AutopilotSummary | null;
  hasStock: boolean;
  stockOnly: boolean;
  setStockOnly: (value: boolean) => void;
  loadFile: (file: File) => Promise<void>;
  start: () => Promise<void>;
  reset: () => void;
} {
  const [stage, setStage] = useState<AutopilotStage>("idle");
  const [sheet, setSheet] = useState<ParsedPosSheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<AutopilotProgress>(emptyProgress);
  const [summary, setSummary] = useState<AutopilotSummary | null>(null);
  const [stockOnly, setStockOnly] = useState(false);
  const running = useRef(false);

  const hasStock = useMemo(
    () => (sheet ? hasStockData(sheet.items) : false),
    [sheet],
  );

  const reset = useCallback(() => {
    if (running.current) return;
    setStage("idle");
    setSheet(null);
    setFileName("");
    setError("");
    setProgress(emptyProgress);
    setSummary(null);
    setStockOnly(false);
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      setError("");
      setSummary(null);
      setSheet(null);
      setFileName(file.name);
      setStage("parsing");
      try {
        const parsed = await parsePosFile(file, {
          dedupe: vendorTypeId === PHARMACY_VENDOR_TYPE_ID,
        });
        setSheet(parsed);
        setProgress({ ...emptyProgress, total: parsed.items.length });
        setStage("ready");
      } catch (parseError) {
        setError(
          parseError instanceof Error
            ? parseError.message
            : "تعذر قراءة ملف نقاط البيع.",
        );
        setStage("failed");
      }
    },
    [vendorTypeId],
  );

  const start = useCallback(async () => {
    if (!sheet || sheet.items.length === 0 || running.current) return;
    running.current = true;
    setError("");
    setStage("running");

    const sourceItems = stockOnly ? inStockItems(sheet.items) : sheet.items;
    if (sourceItems.length === 0) {
      setError("لا توجد أصناف متوفرة في المخزون لاستيرادها.");
      setStage("failed");
      running.current = false;
      return;
    }

    const inputs = sourceItems.map((item, index) => ({
      id: `it-${index + 1}`,
      name: item.name,
      unit: item.unit,
      barcode: item.barcode,
      priceMinor: item.priceMinor,
      company: item.company,
      quantity: item.quantity,
    }));
    const next: AutopilotProgress = { ...emptyProgress, total: inputs.length };
    setProgress({ ...next });
    let wrote = false;
    const failures: { name: string; message: string }[] = [];

    try {
      for (let offset = 0; offset < inputs.length; offset += BATCH_SIZE) {
        const batch = inputs.slice(offset, offset + BATCH_SIZE);
        const enriched = await postWithRetry<{ items: EnrichedItem[] }>(
          "/api/catalog/autopilot/enrich",
          { merchantId, items: batch },
        );
        const byId = new Map(enriched.items.map((item) => [item.id, item]));

        const saveItems = batch.map((input) => {
          const enrichment = byId.get(input.id);
          return {
            ...input,
            categoryKey: enrichment?.categoryKey || FALLBACK_CATEGORY,
            imageDataUrl: enrichment?.imageDataUrl ?? null,
            imageUrlRaw: enrichment?.imageUrlRaw ?? null,
            imageSource: enrichment?.imageSource ?? ("no_image" as const),
            masterCatalogId: enrichment?.masterCatalogId ?? null,
          };
        });

        const saved = await postWithRetry<SaveResult>(
          "/api/catalog/autopilot/save",
          { merchantId, items: saveItems },
        );
        wrote = true;

        for (const item of saveItems) {
          next.matchedMaster += item.masterCatalogId ? 1 : 0;
          if (item.imageSource === "web_search") next.enrichedWeb += 1;
          if (item.imageSource === "existing") next.reused += 1;
          if (item.imageSource === "no_image") next.noImage += 1;
        }
        next.inserted += saved.inserted;
        next.updated += saved.updated;
        next.failed += saved.failed;
        if (saved.failures) failures.push(...saved.failures);
        next.processed += batch.length;
        setProgress({ ...next });
        if (offset + BATCH_SIZE < inputs.length) {
          await sleep(BATCH_DELAY_MS);
        }
      }

      setSummary({
        totalParsed: inputs.length,
        inserted: next.inserted,
        updated: next.updated,
        matchedMaster: next.matchedMaster,
        enrichedWeb: next.enrichedWeb,
        noImage: next.noImage,
        skippedParse: sheet.skipped.length,
        saveFailed: next.failed,
        failures: failures.slice(0, 25),
      });
      setStage("done");
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "توقف الاستيراد قبل اكتمال كل الصفوف.",
      );
      setStage("failed");
    } finally {
      running.current = false;
      if (wrote) onSaved();
    }
  }, [merchantId, onSaved, sheet, stockOnly]);

  return {
    stage,
    sheet,
    fileName,
    error,
    progress,
    summary,
    hasStock,
    stockOnly,
    setStockOnly,
    loadFile,
    start,
    reset,
  };
}
