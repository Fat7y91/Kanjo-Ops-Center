"use client";

import { useCallback, useMemo, useState } from "react";

import type { CapitalDeposit } from "@/lib/profile/capital";
import type { PayoutMethodRecord } from "@/lib/profile/types";

type ApiError = { error?: string };

async function message(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as ApiError;
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Review state and handlers for the capital board.
 *
 * Keeps the two decision endpoints and their optimistic row replacement out of
 * the render module, so each queue body stays a pure presentation of state.
 */
export function useCapitalReview(
  initialDeposits: CapitalDeposit[],
  initialPayouts: PayoutMethodRecord[],
) {
  const [deposits, setDeposits] = useState(initialDeposits);
  const [payouts, setPayouts] = useState(initialPayouts);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [accountByDeposit, setAccountByDeposit] = useState<
    Record<string, string>
  >({});

  const pendingDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.status === "pending"),
    [deposits],
  );
  const pendingPayouts = useMemo(
    () => payouts.filter((payout) => payout.status === "pending"),
    [payouts],
  );

  async function decideDeposit(
    deposit: CapitalDeposit,
    status: "approved" | "rejected",
  ) {
    setBusyId(deposit.id);
    setError("");
    try {
      const accountId =
        status === "approved" ? accountByDeposit[deposit.id] : null;
      const response = await fetch(
        `/api/capital-deposits/${deposit.id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, accountId }),
        },
      );
      const payload = (await response.json()) as {
        deposit?: CapitalDeposit;
        error?: string;
      };
      if (!response.ok || !payload.deposit) {
        setError(payload.error ?? "تعذر تسجيل القرار.");
        return;
      }
      setDeposits((current) =>
        current.map((row) => (row.id === deposit.id ? payload.deposit! : row)),
      );
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusyId("");
    }
  }

  async function decidePayout(
    payout: PayoutMethodRecord,
    status: "approved" | "rejected",
  ) {
    setBusyId(payout.id);
    setError("");
    try {
      const response = await fetch(
        `/api/payout-methods/${payout.id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const payload = (await response.json()) as {
        payoutMethod?: PayoutMethodRecord;
        error?: string;
      };
      if (!response.ok || !payload.payoutMethod) {
        setError(payload.error ?? "تعذر تسجيل القرار.");
        return;
      }
      setPayouts((current) =>
        current.map((row) =>
          row.id === payout.id ? payload.payoutMethod! : row,
        ),
      );
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusyId("");
    }
  }

  return {
    deposits,
    payouts,
    error,
    busyId,
    accountByDeposit,
    setAccountByDeposit,
    pendingDeposits,
    pendingPayouts,
    decideDeposit,
    decidePayout,
  };
}
