"use client";

import { useCallback, useState } from "react";

import type { PartyStatement } from "@/lib/operations/types";

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

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/clearinghouse/accounts/${id}/statement`,
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
    (id: string) => {
      setAccountId(id);
      setStatement(null);
      setOpen(true);
      void load(id);
    },
    [load],
  );

  const close = useCallback(() => {
    setOpen(false);
    setStatement(null);
    setError("");
    setAccountId("");
  }, []);

  const retry = useCallback(() => {
    if (accountId) void load(accountId);
  }, [accountId, load]);

  return { open, loading, error, statement, openFor, close, retry };
}
