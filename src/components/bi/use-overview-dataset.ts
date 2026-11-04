"use client";

import { useCallback, useEffect, useState } from "react";

import { biDatasetSchema, type BiDataset } from "@/lib/bi/types";

type OverviewDatasetState =
  | { status: "loading"; dataset: null; error: null }
  | { status: "ready"; dataset: BiDataset; error: null }
  | { status: "failed"; dataset: null; error: Error };

const LOADING: OverviewDatasetState = {
  status: "loading",
  dataset: null,
  error: null,
};

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
 */
export function useOverviewDataset() {
  const [state, setState] = useState<OverviewDatasetState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    setState(LOADING);

    void (async () => {
      try {
        const response = await fetch("/api/bi/overview", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Overview dataset request failed (${response.status}).`);
        }

        const parsed = biDatasetSchema.safeParse(await response.json());
        if (!parsed.success) {
          throw new Error("Overview dataset does not match the expected shape.");
        }

        if (mounted) {
          setState({ status: "ready", dataset: parsed.data, error: null });
        }
      } catch (error) {
        // An aborted request is the unmount path, not a failure to report.
        if (!mounted || controller.signal.aborted) return;
        setState({
          status: "failed",
          dataset: null,
          error:
            error instanceof Error
              ? error
              : new Error("Overview dataset request failed."),
        });
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [attempt]);

  return { ...state, reload };
}
