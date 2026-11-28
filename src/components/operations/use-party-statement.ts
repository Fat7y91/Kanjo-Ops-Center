"use client";

import { useCallback, useState } from "react";

import type {
  PartyStatement,
  StatementRange,
} from "@/lib/operations/types";

/**
 * Loads a party statement for the drill-down modal.
 *
 * The account id is the only thing the row already has; the detail arrives on
 * demand. The fetch is last-request-wins so a fast click across two parties can
 * never paint one party's statement under another's header.
 */
export function usePartyStatement() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statement, setStatement] = useState<PartyStatement | null>(null);
  const [accountId, setAccountId] = useState("");
  const [range, setRange] = useState<StatementRange | null>(null);

  const load = useCallback(async (id: string, window: StatementRange | null) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (window?.from) query.set("from", window.from);
      if (window?.to) query.set("to", window.to);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const response = await fetch(
        `/api/clearinghouse/accounts/${id}/statement${suffix}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | PartyStatement
        | { error?: string };
      if (!response.ok) {
        setError(
          "error" in payload && payload.error
            ? payload.error
            : "تعذر تحميل كشف الحساب.",
        );
        return;
      }
      setStatement(payload as PartyStatement);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openFor = useCallback(
    (id: string, window: StatementRange | null = null) => {
      setAccountId(id);
      setRange(window);
      setStatement(null);
      setOpen(true);
      void load(id, window);
    },
    [load],
  );

  const close = useCallback(() => {
    setOpen(false);
    setStatement(null);
    setError("");
    setAccountId("");
    setRange(null);
  }, []);

  const retry = useCallback(() => {
    if (accountId) void load(accountId, range);
  }, [accountId, range, load]);

  return { open, loading, error, statement, openFor, close, retry };
}
