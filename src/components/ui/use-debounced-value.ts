"use client";

import { useEffect, useState } from "react";

/**
 * Tracks a value until it has stopped changing for `delay` ms.
 *
 * Search boxes keep their own immediate value for the input, while the list
 * filters on this delayed copy so a fast typist does not re-render the grid on
 * every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
