"use client";

import { useCallback, useState } from "react";

import type { JournalEntryDetail } from "@/lib/journal/types";

/**
 * Loads one journal voucher for the drill-down modal.
 *
 * The row already carries the entry id, so only the detail is fetched. The fetch
 * is last-request-wins: a fast click across two rows must never paint one entry
 * under another's header.
 */
export function useJournalVoucher() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [voucher, setVoucher] = useState<JournalEntryDetail | null>(null);
  const [entryId, setEntryId] = useState("");

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/journal/entries/${id}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | JournalEntryDetail
        | { error?: string };
      if (!response.ok) {
        setError(
          "error" in payload && payload.error
            ? payload.error
            : "تعذر تحميل تفاصيل القيد.",
        );
        return;
      }
      setVoucher(payload as JournalEntryDetail);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openFor = useCallback(
    (id: string) => {
      if (!id) return;
      setEntryId(id);
      setVoucher(null);
      setOpen(true);
      void load(id);
    },
    [load],
  );

  const close = useCallback(() => {
    setOpen(false);
    setVoucher(null);
    setError("");
    setEntryId("");
  }, []);

  const retry = useCallback(() => {
    if (entryId) void load(entryId);
  }, [entryId, load]);

  return { open, loading, error, voucher, openFor, close, retry };
}
