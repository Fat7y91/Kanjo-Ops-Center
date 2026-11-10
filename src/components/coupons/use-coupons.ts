"use client";

import { useCallback, useMemo, useState } from "react";

import type { Coupon, CouponType } from "@/lib/coupons/types";

export type CouponFilters = {
  query: string;
  status: "all" | "active" | "inactive";
  type: CouponType | "all";
};

const EMPTY_FILTERS: CouponFilters = {
  query: "",
  status: "all",
  type: "all",
};

/** View state for the coupons catalogue: filters, selection and modal flags. */
export function useCoupons(initialCoupons: Coupon[]) {
  const [coupons, setCoupons] = useState<Coupon[]>(
    Array.isArray(initialCoupons) ? initialCoupons : [],
  );
  const [filters, setFilters] = useState<CouponFilters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  function setFilter<K extends keyof CouponFilters>(
    key: K,
    value: CouponFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const visible = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase("ar");
    return coupons.filter((coupon) => {
      if (filters.status === "active" && !coupon.active) return false;
      if (filters.status === "inactive" && coupon.active) return false;
      if (filters.type !== "all" && coupon.couponType !== filters.type) {
        return false;
      }
      if (!query) return true;
      return coupon.code.toLocaleLowerCase("ar").includes(query);
    });
  }, [coupons, filters]);

  function notify(message: string) {
    setError("");
    setToast(message);
  }

  const dismissToast = useCallback(() => setToast(""), []);

  const applySaved = useCallback((coupon: Coupon, message: string) => {
    setCoupons((current) => {
      const exists = current.some((row) => row.id === coupon.id);
      return exists
        ? current.map((row) => (row.id === coupon.id ? coupon : row))
        : [coupon, ...current];
    });
    setError("");
    setToast(message);
  }, []);

  async function refresh() {
    setError("");
    try {
      const response = await fetch("/api/coupons", { cache: "no-store" });
      const payload = (await response.json()) as {
        coupons?: Coupon[];
        error?: string;
      };
      if (!response.ok || !payload.coupons) {
        setError(payload.error ?? "تعذر تحديث الكوبونات.");
        return;
      }
      setCoupons(payload.coupons);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    }
  }

  async function remove(coupon: Coupon) {
    setError("");
    try {
      const response = await fetch(`/api/coupons/${coupon.id}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "تعذر حذف الكوبون.");
        return;
      }
      setCoupons((current) => current.filter((row) => row.id !== coupon.id));
      notify("تم حذف الكوبون.");
    } catch {
      setError("تعذر الاتصال بالخادم.");
    }
  }

  return {
    coupons,
    visible,
    filters,
    setFilter,
    editing,
    setEditing,
    creating,
    setCreating,
    importing,
    setImporting,
    toast,
    error,
    setToast: notify,
    dismissToast,
    applySaved,
    refresh,
    remove,
  };
}
