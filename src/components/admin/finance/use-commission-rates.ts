"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CityCommissionRate } from "@/lib/commissions/types";

export type ActiveCommissionRate = {
  rate: CityCommissionRate | null;
  source: "override" | "global";
};

export type CommissionRatesSnapshot = {
  active: ActiveCommissionRate | null;
  rows: CityCommissionRate[];
};

type UseCommissionRatesResult = {
  snapshot: CommissionRatesSnapshot | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
};

/**
 * Loads the active fee schedule for the selected city (or the global fallback
 * when no city is selected). Refetches whenever the selection changes; a
 * stale response can never overwrite a newer one.
 */
export function useCommissionRates(
  cityId: string | null,
  initialSnapshot?: CommissionRatesSnapshot | null,
): UseCommissionRatesResult {
  const [snapshot, setSnapshot] = useState<CommissionRatesSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const query = cityId ? `?cityId=${encodeURIComponent(cityId)}` : "";
      const response = await fetch(`/api/admin/commission-rates${query}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        active?: ActiveCommissionRate | null;
        rows?: CityCommissionRate[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر تحميل الأسعار.");
      }
      if (requestId !== requestRef.current) return;
      setSnapshot({ active: payload.active ?? null, rows: payload.rows ?? [] });
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setError(
        loadError instanceof Error ? loadError.message : "تعذر تحميل الأسعار.",
      );
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [cityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { snapshot, loading, error, reload };
}
