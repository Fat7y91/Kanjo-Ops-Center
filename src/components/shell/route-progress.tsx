"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Global soft-navigation progress bar.
 *
 * The App Router streams RSC payloads; while that happens we surface a thin
 * indeterminate bar so a click never feels unresponsive. It is skipped for
 * modified clicks (new tab/download) and hash-only jumps.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const start = () => {
      clearTimer();
      setActive(true);
      timerRef.current = window.setTimeout(() => setActive(false), 8_000);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      start();
    };

    const onPopState = () => start();

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      clearTimer();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setActive(false), 180);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      className={`route-progress${active ? " is-active" : ""}`}
      role="progressbar"
      aria-label="جارٍ الانتقال"
      aria-hidden={!active}
    />
  );
}
