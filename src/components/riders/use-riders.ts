"use client";

import { useCallback, useMemo, useState } from "react";

import type { Rider, RiderStatus } from "@/lib/riders/types";

export type RiderFilters = {
  query: string;
  status: RiderStatus | "all";
};

const EMPTY_FILTERS: RiderFilters = { query: "", status: "all" };

export function useRiders(initialRiders: Rider[]) {
  const [riders, setRiders] = useState<Rider[]>(
    Array.isArray(initialRiders) ? initialRiders : [],
  );
  const [filters, setFilters] = useState<RiderFilters>(EMPTY_FILTERS);
  const [creating, setCreating] = useState(false);
  const [issuingFor, setIssuingFor] = useState<Rider | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  function setFilter<K extends keyof RiderFilters>(
    key: K,
    value: RiderFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const visible = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase("ar");
    return riders.filter((rider) => {
      if (filters.status !== "all" && rider.status !== filters.status) {
        return false;
      }
      if (!query) return true;
      const custody = rider.activeCustody?.custodyNumber ?? "";
      return [
        rider.fullName,
        rider.phone,
        rider.riderCode,
        rider.workArea,
        custody,
      ].some((value) => value.toLocaleLowerCase("ar").includes(query));
    });
  }, [riders, filters]);

  const stats = useMemo(() => {
    const withCustody = riders.filter((rider) => rider.activeCustody).length;
    const custodyValue = riders.reduce(
      (sum, rider) => sum + (rider.activeCustody?.totalAmount ?? 0),
      0,
    );
    return {
      total: riders.length,
      withCustody,
      withoutCustody: riders.length - withCustody,
      custodyValue,
    };
  }, [riders]);

  const notify = useCallback((message: string) => {
    setError("");
    setToast(message);
  }, []);

  const dismissToast = useCallback(() => setToast(""), []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/riders", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as {
        riders?: Rider[];
      };
      if (Array.isArray(body.riders)) setRiders(body.riders);
    } catch {
      /* Keep the last good board when the refresh fails. */
    }
  }, []);

  const issued = useCallback(
    async (message: string) => {
      setCreating(false);
      setIssuingFor(null);
      notify(message);
      await refresh();
    },
    [notify, refresh],
  );

  return {
    riders,
    visible,
    stats,
    filters,
    setFilter,
    creating,
    setCreating,
    issuingFor,
    setIssuingFor,
    toast,
    error,
    setError,
    dismissToast,
    refresh,
    issued,
  };
}
