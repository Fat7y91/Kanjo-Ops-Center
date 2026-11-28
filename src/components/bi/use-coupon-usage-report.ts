"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  EMPTY_DELIVERED_USAGE,
  type DeliveredCouponUsage,
} from "@/lib/coupons/delivered-usage";
import type { CouponUsageReportRow } from "@/lib/coupons/usage-report";
import {
  buildCouponUsageView,
  type CouponUsageMode,
} from "@/lib/coupons/usage-view";

/** Loads the imported snapshot plus delivered actuals and selects the view. */
export function useCouponUsageReport() {
  const [rows, setRows] = useState<CouponUsageReportRow[]>([]);
  const [delivered, setDelivered] = useState<DeliveredCouponUsage>(
    EMPTY_DELIVERED_USAGE,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUnused, setShowUnused] = useState(false);
  const [mode, setMode] = useState<CouponUsageMode>("report");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/coupons/usage-report", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        rows?: CouponUsageReportRow[];
        delivered?: DeliveredCouponUsage;
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "تعذر تحميل تقرير الكوبونات.");
        return;
      }
      setRows(payload.rows ?? []);
      setDelivered(payload.delivered ?? EMPTY_DELIVERED_USAGE);
    } catch {
      setError("تعذر الاتصال بالخادم. أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const view = useMemo(
    () => buildCouponUsageView({ mode, reportRows: rows, delivered, showUnused }),
    [mode, rows, delivered, showUnused],
  );

  return {
    rows,
    delivered,
    view,
    visible: view.rows,
    topCodes: view.topCodes,
    totals: view.totals,
    loading,
    error,
    showUnused,
    setShowUnused,
    mode,
    setMode,
    importing,
    setImporting,
    load,
  };
}
