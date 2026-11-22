"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "kanjo.excludeInternalStaff";

/**
 * Shared internal-courier scope switch.
 *
 * The choice is persisted so the settlement board and the dashboard agree after
 * a reload. The first render is always OFF to avoid a hydration mismatch; the
 * stored value is applied right after mount.
 */
export function useInternalStaffFilter() {
  const [excludeInternalStaff, setExcludeState] = useState(false);

  useEffect(() => {
    try {
      setExcludeState(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* Private mode can block storage; the in-memory default still works. */
    }
  }, []);

  const setExcludeInternalStaff = useCallback((next: boolean) => {
    setExcludeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* Ignore storage failures. */
    }
  }, []);

  return { excludeInternalStaff, setExcludeInternalStaff };
}
