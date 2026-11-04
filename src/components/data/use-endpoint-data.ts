"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Lifecycle of a screen whose facts arrive after its shell.
 *
 * Three states, not four: "loading" also covers a retry, because the panel that
 * shows a failure is replaced by the skeleton the moment the operator asks
 * again — there is no separate idle state to render.
 */
export type EndpointState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "failed"; data: null; error: Error };

const LOADING = { status: "loading", data: null, error: null } as const;

/**
 * Loads one authorized endpoint for an island.
 *
 * Every shell-plus-endpoint surface does the same four things — fetch, validate,
 * abort on unmount, retry on demand — so they share this hook instead of each
 * carrying a copy where the abort or the validation inevitably drifts.
 *
 * `parse` is required and receives `unknown`: the body is a runtime fact, and a
 * field renamed on either side of the wire has to fail here, with a retry, not
 * surface as `undefined` three components deeper. Callers pass
 * `schema.parse` or a small boundary check.
 *
 * The request is aborted when the island unmounts, so a fast navigation cannot
 * land a payload from the screen the operator already left.
 *
 * `parse` belongs in the dependency list, so callers pass a module-level
 * function: a parser rebuilt on every render would restart the request loop.
 *
 * The return type is deliberately inferred rather than annotated: the object
 * spread distributes over the union, so `status === "ready"` narrows `data` to
 * `T` at the call site. Annotating it as `EndpointState<T> & { reload }` would
 * collapse the union back into an intersection and lose that narrowing.
 */
export function useEndpointData<T>(
  url: string,
  parse: (input: unknown) => T,
) {
  const [state, setState] = useState<EndpointState<T>>(LOADING);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    setState(LOADING);

    void (async () => {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`${url} answered ${response.status}.`);
        }

        const data = parse(await response.json());
        if (mounted) setState({ status: "ready", data, error: null });
      } catch (error) {
        // An aborted request is the unmount path, not a failure to report.
        if (!mounted || controller.signal.aborted) return;
        setState({
          status: "failed",
          data: null,
          error: error instanceof Error ? error : new Error(`${url} failed.`),
        });
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [url, parse, attempt]);

  return { ...state, reload };
}
