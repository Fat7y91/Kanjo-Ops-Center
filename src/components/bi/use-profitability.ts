"use client";

import { useEndpointData } from "@/components/data/use-endpoint-data";
import {
  profitabilitySummarySchema,
  type ProfitabilitySummary,
} from "@/lib/bi/profitability";

/** Module-level so the hook's dependency list stays stable. */
const parseSummary = (input: unknown): ProfitabilitySummary =>
  profitabilitySummarySchema.parse(input);

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
) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (cityId) params.set("cityId", cityId);
  const query = params.toString();

  return useEndpointData(
    `/api/bi/profitability${query ? `?${query}` : ""}`,
    parseSummary,
  );
}
