"use client";

import { useState } from "react";

import type { ClearingAccountRow } from "@/lib/operations/types";

/**
 * Settlement state for the clearinghouse board.
 *
 * The book is a list of party accounts, each with a derived balance. Settling
 * one account posts a fresh journal entry that zeroes it and refreshes the
 * whole book, so the panels always reflect the journal rather than a local
 * guess.
 */
export function useClearinghouse(
  initialAccounts: ClearingAccountRow[],
  initialPayables: ClearingAccountRow[],
  initialReceivables: ClearingAccountRow[],
) {
  // Same defensive contract as the operations form: a partial board must
  // render an empty list, never crash on `.filter` / `.map`.
  const [accounts, setAccounts] = useState<ClearingAccountRow[]>(
    Array.isArray(initialAccounts) ? initialAccounts : [],
  );
  const [payables, setPayables] = useState<ClearingAccountRow[]>(
    Array.isArray(initialPayables) ? initialPayables : [],
  );
  const [receivables, setReceivables] = useState<ClearingAccountRow[]>(
    Array.isArray(initialReceivables) ? initialReceivables : [],
  );
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [receiptNo, setReceiptNo] = useState<Record<string, string>>({});
  const [file, setFile] = useState<Record<string, File | null>>({});

  async function refresh() {
    setError("");
    try {
      const response = await fetch("/api/clearinghouse", { cache: "no-store" });
      const payload = (await response.json()) as {
        accounts?: ClearingAccountRow[];
        payables?: ClearingAccountRow[];
        receivables?: ClearingAccountRow[];
        error?: string;
      };
      if (!response.ok || !payload.accounts) {
        setError(payload.error ?? "تعذر تحديث المقاصة.");
        return;
      }
      setAccounts(payload.accounts);
      setPayables(payload.payables ?? []);
      setReceivables(payload.receivables ?? []);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    }
  }

  async function settle(account: ClearingAccountRow) {
    setBusyId(account.accountId);
    setError("");
    try {
      const form = new FormData();
      form.set("accountId", account.accountId);
      const no = receiptNo[account.accountId]?.trim();
      if (no) form.set("receiptNo", no);
      const chosen = file[account.accountId];
      if (chosen) form.set("file", chosen);

      const response = await fetch("/api/clearinghouse", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        entryId?: string;
        error?: string;
      };
      if (!response.ok || !payload.entryId) {
        setError(payload.error ?? "تعذر تسوية الحساب.");
        return;
      }
      setReceiptNo((current) => ({ ...current, [account.accountId]: "" }));
      setFile((current) => ({ ...current, [account.accountId]: null }));
      await refresh();
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusyId("");
    }
  }

  return {
    accounts,
    payables,
    receivables,
    busyId,
    error,
    receiptNo,
    setReceiptNo,
    file,
    setFile,
    refresh,
    settle,
  };
}
