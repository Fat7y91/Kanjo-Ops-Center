"use client";

import { useEndpointData } from "@/components/data/use-endpoint-data";
import {
  profitabilitySummarySchema,
  type ProfitabilitySummary,
} from "@/lib/bi/profitability";

/** Module-level so the hook's dependency list stays stable. */
const parseSummary = (input: unknown): ProfitabilitySummary =>
  profitabilitySummarySchema.parse(input);

/** One URL builder shared by the live card and the export fallback. */
export function profitabilityUrl(
  from: string | null,
  to: string | null,
  cityId: string | null,
  excludeInternalStaff = false,
): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (cityId) params.set("cityId", cityId);
  if (excludeInternalStaff) params.set("excludeInternalStaff", "1");
  const query = params.toString();
  return `/api/bi/profitability${query ? `?${query}` : ""}`;
}

/**
 * Loads the order P&L waterfall for one range/city slice.
 *
 * The URL is the slice: changing a filter changes the URL, and the shared
 * endpoint hook aborts the previous request so a fast filter change cannot
 * paint a stale card.
 */
export function useProfitability(
  from: string | null,
  to: string | null,
  cityId: string | null,
  excludeInternalStaff = false,
) {
  return useEndpointData(
    profitabilityUrl(from, to, cityId, excludeInternalStaff),
    parseSummary,
  );
}

/**
 * Export-time fetch.
 *
 * The workbook must always carry the P&L sheet, even if the operator hits
 * export before the card's first request finishes. A failed fetch returns null
 * so the settlement sheets still download.
 */
export async function fetchProfitability(
  from: string | null,
  to: string | null,
  cityId: string | null,
  excludeInternalStaff = false,
): Promise<ProfitabilitySummary | null> {
  try {
    const response = await fetch(
      profitabilityUrl(from, to, cityId, excludeInternalStaff),
      { cache: "no-store", credentials: "same-origin" },
    );
    if (!response.ok) return null;
    return parseSummary(await response.json());
  } catch {
    return null;
  }
}
