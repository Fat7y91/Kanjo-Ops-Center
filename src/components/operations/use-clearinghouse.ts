"use client";

import { useState } from "react";

import type { ClearingAccountRow } from "@/lib/operations/types";

export type SettlementDraft = {
  amount: string;
  receiptNo: string;
  file: File | null;
};

export type SettlementResult = { ok: boolean; error: string };

/**
 * Settlement state for the clearinghouse board.
 *
 * The book is a list of party accounts, each with a derived balance. Settling
 * one account posts a fresh journal entry that zeroes (or reduces) it and
 * refreshes the whole book, so the panels always reflect the journal rather than
 * a local guess.
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
  /**
   * Partial-settlement amounts keyed by account. A blank entry means "settle in
   * full", which is the existing behaviour; a value is validated against the
   * outstanding balance before it leaves the client, and re-bounded by SQL.
   */
  const [partialAmount, setPartialAmount] = useState<Record<string, string>>({});

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

  /**
   * Posts one settlement. Returns a typed result so the quick-settle dialog can
   * show its own error without touching the board's banner.
   */
  async function submitSettlement(
    account: ClearingAccountRow,
    draft: SettlementDraft,
  ): Promise<SettlementResult> {
    const raw = draft.amount.trim();
    const outstanding = Math.abs(account.balance);
    if (raw !== "") {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { ok: false, error: "أدخل مبلغاً صحيحاً للتسوية الجزئية." };
      }
      if (Math.round(parsed * 100) > Math.round(outstanding * 100)) {
        return { ok: false, error: "المبلغ أكبر من الرصيد المستحق." };
      }
    }

    try {
      const form = new FormData();
      form.set("accountId", account.accountId);
      const no = draft.receiptNo.trim();
      if (no) form.set("receiptNo", no);
      if (raw !== "") form.set("amount", raw);
      if (draft.file) form.set("file", draft.file);

      const response = await fetch("/api/clearinghouse", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        entryId?: string;
        error?: string;
      };
      if (!response.ok || !payload.entryId) {
        return { ok: false, error: payload.error ?? "تعذر تسوية الحساب." };
      }
      await refresh();
      return { ok: true, error: "" };
    } catch {
      return { ok: false, error: "تعذر الاتصال بالخادم." };
    }
  }

  async function settle(account: ClearingAccountRow) {
    setBusyId(account.accountId);
    setError("");

    const result = await submitSettlement(account, {
      amount: partialAmount[account.accountId] ?? "",
      receiptNo: receiptNo[account.accountId] ?? "",
      file: file[account.accountId] ?? null,
    });

    if (result.ok) {
      setReceiptNo((current) => ({ ...current, [account.accountId]: "" }));
      setFile((current) => ({ ...current, [account.accountId]: null }));
      setPartialAmount((current) => ({ ...current, [account.accountId]: "" }));
    } else {
      setError(result.error);
    }
    setBusyId("");
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
    partialAmount,
    setPartialAmount,
    refresh,
    settle,
    submitSettlement,
  };
}
