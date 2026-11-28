"use client";

import { useState } from "react";

import type { RiderLookup } from "@/lib/riders/types";

type UseRiderLookupArgs = {
  onFound: (rider: RiderLookup) => void;
};

export function useRiderLookup({ onFound }: UseRiderLookupArgs) {
  const [lookup, setLookup] = useState<RiderLookup | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "new" | "found">(
    "idle",
  );
  const [error, setError] = useState("");

  function reset() {
    setLookup(null);
    setState("idle");
    setError("");
  }

  async function check(nationalId: string) {
    if (!/^[0-9]{14}$/.test(nationalId)) {
      setError("أدخل الرقم القومي كاملاً (14 رقماً) أولاً.");
      return;
    }
    setState("loading");
    setError("");
    try {
      const response = await fetch(
        `/api/riders/lookup?nationalId=${encodeURIComponent(nationalId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as {
        rider?: RiderLookup | null;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "تعذر التحقق من المندوب.");
        setState("idle");
        return;
      }
      if (!body.rider) {
        setLookup(null);
        setState("new");
        return;
      }

      const rider = body.rider;
      setLookup(rider);
      setState("found");
      onFound(rider);

      if (rider.status !== "active") {
        setError("المندوب غير نشط ولا يمكن إصدار عهدة له.");
      } else {
        setError(
          "هذا الرقم مسجل لمندوب حالي. اختر «مندوب حالي» لإصدار إيصال إضافي.",
        );
      }
    } catch {
      setError("تعذر الاتصال بالخادم.");
      setState("idle");
    }
  }

  return {
    lookup,
    state,
    error,
    check,
    reset,
    hasBlockingLookup: lookup !== null,
  };
}
