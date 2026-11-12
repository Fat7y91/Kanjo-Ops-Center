"use client";

import { useEffect, useMemo, useState } from "react";

import type { MerchantRow } from "@/lib/field-ops/payload";
import { smartTextScore } from "@/lib/search/normalize";

export type MerchantFilters = {
  query: string;
  cityName: string | null;
  teamLabel: string | null;
  stateLabel: string | null;
  vendorTypeId: number | null;
};

const EMPTY_FILTERS: MerchantFilters = {
  query: "",
  cityName: null,
  teamLabel: null,
  stateLabel: null,
  vendorTypeId: null,
};

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "ar"));
}

/**
 * Directory view state: free-text search plus the four attribute slicers
 * (city, owning team, lifecycle state, merchant category).
 *
 * Filtering runs client-side against the already-streamed rows, so every change
 * is instant and no request is issued. The query is mirrored into the URL while
 * the attribute filters stay in memory, because a deep link is only useful for
 * the searchable term and would otherwise grow into a very long address.
 */
export function useMerchantDirectory(
  rows: MerchantRow[],
  initialQuery: string,
): {
  filters: MerchantFilters;
  setFilter: <K extends keyof MerchantFilters>(
    key: K,
    value: MerchantFilters[K],
  ) => void;
  reset: () => void;
  isFiltered: boolean;
  visibleRows: MerchantRow[];
  cityOptions: string[];
  teamOptions: string[];
  stateOptions: string[];
  categoryOptions: Array<{ value: number; label: string }>;
} {
  const [filters, setFilters] = useState<MerchantFilters>({
    ...EMPTY_FILTERS,
    query: initialQuery,
  });

  useEffect(() => {
    const params = new URLSearchParams();
    const trimmed = filters.query.trim();
    if (trimmed) params.set("q", trimmed);
    const target = params.toString() ? `/merchants?${params}` : "/merchants";

    if (target !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", target);
    }
  }, [filters.query]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setFilters((current) => ({ ...current, query: params.get("q") ?? "" }));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const cityOptions = useMemo(
    () => unique(rows.map((row) => row.cityName)),
    [rows],
  );
  const teamOptions = useMemo(
    () => unique(rows.map((row) => row.teamLabel)),
    [rows],
  );
  const stateOptions = useMemo(
    () => unique(rows.map((row) => row.stateLabel)),
    [rows],
  );
  const categoryOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows) seen.set(row.vendorTypeId, row.vendorType);
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "ar"));
  }, [rows]);

  const visibleRows = useMemo(() => {
    const trimmed = filters.query.trim();
    const filtered = rows.filter(
      (row) =>
        (filters.cityName === null || row.cityName === filters.cityName) &&
        (filters.teamLabel === null || row.teamLabel === filters.teamLabel) &&
        (filters.stateLabel === null || row.stateLabel === filters.stateLabel) &&
        (filters.vendorTypeId === null ||
          row.vendorTypeId === filters.vendorTypeId),
    );

    if (!trimmed) return filtered;

    return filtered
      .map((row) => ({
        row,
        score: Math.max(
          smartTextScore(trimmed, row.name).score,
          smartTextScore(trimmed, row.vendorType).score,
          smartTextScore(trimmed, row.cityName).score,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.row);
  }, [rows, filters]);

  const isFiltered =
    filters.query.trim() !== "" ||
    filters.cityName !== null ||
    filters.teamLabel !== null ||
    filters.stateLabel !== null ||
    filters.vendorTypeId !== null;

  const setFilter: ReturnType<typeof useMerchantDirectory>["setFilter"] = (
    key,
    value,
  ) => setFilters((current) => ({ ...current, [key]: value }));

  const reset = () => setFilters(EMPTY_FILTERS);

  return {
    filters,
    setFilter,
    reset,
    isFiltered,
    visibleRows,
    cityOptions,
    teamOptions,
    stateOptions,
    categoryOptions,
  };
}
