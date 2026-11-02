"use client";

import { useMemo, useState } from "react";

import type {
  ClearingLedgerRow,
  ClearingParty,
  ClearingStatus,
} from "@/lib/operations/types";

/**
 * Settlement state for the clearinghouse board.
 *
 * A row is settled individually, not per party: the book groups by party for
 * reading, but money leaves against the exact order that produced it. The hook
 * therefore keeps the flat row list and re-derives the balances after each
 * successful decision.
 */
export function useClearinghouse(
  initialRows: ClearingLedgerRow[],
  initialPayables: ClearingParty[],
  initialReceivables: ClearingParty[],
) {
  const [rows, setRows] = useState(initialRows);
  const [payables, setPayables] = useState(initialPayables);
  const [receivables, setReceivables] = useState(initialReceivables);
  const [status, setStatus] = useState<ClearingStatus>("pending");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<Record<string, string>>({});

  const pendingTotal = useMemo(
    () => rows.filter((row) => row.status === "pending").length,
    [rows],
  );

  async function refresh(nextStatus: ClearingStatus) {
    setStatus(nextStatus);
    setError("");
    try {
      const response = await fetch(`/api/clearinghouse?status=${nextStatus}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        rows?: ClearingLedgerRow[];
        payables?: ClearingParty[];
        receivables?: ClearingParty[];
        error?: string;
      };
      if (!response.ok || !payload.rows) {
        setError(payload.error ?? "تعذر تحديث المقاصة.");
        return;
      }
      setRows(payload.rows);
      setPayables(payload.payables ?? []);
      setReceivables(payload.receivables ?? []);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    }
  }

  async function settle(row: ClearingLedgerRow) {
    setBusyId(row.id);
    setError("");
    try {
      const response = await fetch("/api/clearinghouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, receiptUrl: receiptUrl[row.id] }),
      });
      const payload = (await response.json()) as {
        row?: ClearingLedgerRow;
        error?: string;
      };
      if (!response.ok || !payload.row) {
        setError(payload.error ?? "تعذر تسوية البند.");
        return;
      }
      setRows((current) =>
        current.map((item) => (item.id === row.id ? payload.row! : item)),
      );
      await refresh(status);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusyId("");
    }
  }

  return {
    rows,
    payables,
    receivables,
    status,
    pendingTotal,
    busyId,
    error,
    receiptUrl,
    setReceiptUrl,
    refresh,
    settle,
  };
}
