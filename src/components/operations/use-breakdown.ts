"use client";

import { useCallback, useState } from "react";

import type { OrderBreakdown } from "@/lib/operations/breakdown";
import type { OperationSummary } from "@/lib/operations/types";

/**
 * Drill-down state for the order breakdown modal.
 *
 * The list itself is already on the board (frozen rows), so opening the modal
 * fetches only the audit detail for the chosen order. The fetch is abortable
 * and the last request wins, so a fast double-click cannot render a stale
 * invoice over a newer one.
 */
export function useBreakdown() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [breakdown, setBreakdown] = useState<OrderBreakdown | null>(null);
  const [selectedId, setSelectedId] = useState("");

  const load = useCallback(async (operationId: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/operations/${operationId}/breakdown`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | OrderBreakdown
        | { error?: string };
      if (!response.ok) {
        setError(
          "error" in payload && payload.error
            ? payload.error
            : "تعذر تحميل تفاصيل الطلب.",
        );
        return;
      }
      setBreakdown(payload as OrderBreakdown);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openFor = useCallback(
    (operation: OperationSummary) => {
      setSelectedId(operation.id);
      setBreakdown(null);
      setOpen(true);
      void load(operation.id);
    },
    [load],
  );

  const close = useCallback(() => {
    setOpen(false);
    setBreakdown(null);
    setError("");
    setSelectedId("");
  }, []);

  const retry = useCallback(() => {
    if (selectedId) void load(selectedId);
  }, [load, selectedId]);

  return { open, loading, error, breakdown, openFor, close, retry };
}
