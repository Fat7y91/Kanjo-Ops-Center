"use client";

import { useEndpointData } from "@/components/data/use-endpoint-data";
import { biDatasetSchema, type BiDataset } from "@/lib/bi/types";

/** Module-level so the hook's dependency list stays stable. */
const parseDataset = (input: unknown): BiDataset => biDatasetSchema.parse(input);

/**
 * Loads the overview facts from `/api/bi/overview`.
 *
 * The page used to build this payload during the server render, so every visit
 * paid for the join before any HTML existed. Fetching it here keeps the route
 * response to the shell and lets the operator see the layout immediately.
 *
 * The response is parsed with `biDatasetSchema` rather than cast: a field added
 * or renamed on one side of the wire would otherwise surface as `undefined`
 * inside a chart instead of a readable failure with a retry.
 *
 * Returns the hook's state unchanged: rebuilding the object here would merge the
 * three states into one wide type, and the dashboard's `status === "ready"`
 * check would stop narrowing `data`.
 */
export function useOverviewDataset() {
  return useEndpointData("/api/bi/overview", parseDataset);
}
