"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { CouponUsageReportRow } from "@/lib/coupons/usage-report";

export type CouponUsageReportTotals = {
  uses: number;
  totalImpact: number;
  platformFunded: number;
  vendorFunded: number;
  discountAmount: number;
  shippingDiscount: number;
  cashbackAmount: number;
  activeCodes: number;
  totalCodes: number;
};

/** Loads the imported coupon usage snapshot and derives the visible slice. */
export function useCouponUsageReport() {
  const [rows, setRows] = useState<CouponUsageReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUnused, setShowUnused] = useState(false);
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
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "تعذر تحميل تقرير الكوبونات.");
        return;
      }
      setRows(payload.rows ?? []);
    } catch {
      setError("تعذر الاتصال بالخادم. أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      rows
        .filter((row) => showUnused || row.usesCount > 0)
        .sort((left, right) => right.totalImpact - left.totalImpact),
    [rows, showUnused],
  );

  const topCodes = useMemo(
    () => visible.filter((row) => row.totalImpact > 0).slice(0, 5),
    [visible],
  );

  const totals = useMemo<CouponUsageReportTotals>(
    () =>
      visible.reduce<CouponUsageReportTotals>(
        (summary, row) => ({
          uses: summary.uses + row.usesCount,
          totalImpact: summary.totalImpact + row.totalImpact,
          platformFunded: summary.platformFunded + row.platformFunded,
          vendorFunded: summary.vendorFunded + row.vendorFunded,
          discountAmount: summary.discountAmount + row.discountAmount,
          shippingDiscount: summary.shippingDiscount + row.shippingDiscount,
          cashbackAmount: summary.cashbackAmount + row.cashbackAmount,
          activeCodes: summary.activeCodes + (row.usesCount > 0 ? 1 : 0),
          totalCodes: summary.totalCodes,
        }),
        {
          uses: 0,
          totalImpact: 0,
          platformFunded: 0,
          vendorFunded: 0,
          discountAmount: 0,
          shippingDiscount: 0,
          cashbackAmount: 0,
          activeCodes: 0,
          totalCodes: rows.length,
        },
      ),
    [visible, rows.length],
  );

  return {
    rows,
    visible,
    topCodes,
    totals,
    loading,
    error,
    showUnused,
    setShowUnused,
    importing,
    setImporting,
    load,
  };
}
