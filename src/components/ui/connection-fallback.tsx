"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Graceful "reconnecting" surface for a dropped connection.
 *
 * This is the difference between a network blip and a dead app: instead of the
 * fatal "Application error" screen, the operator sees that the link dropped and
 * the boundary retries by itself the moment the browser reports it is back
 * online (or on a short backoff, since `online` is not always fired).
 */
export function ConnectionFallback({
  title,
  onRetry,
}: {
  title?: string;
  onRetry: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!retrying) return;
    // If the retry fails, the boundary renders this fallback again as a new
    // instance; if for some reason it stays mounted, release the button so the
    // operator is never locked out of retrying.
    const timer = window.setTimeout(() => setRetrying(false), 6_000);
    return () => window.clearTimeout(timer);
  }, [retrying]);

  useEffect(() => {
    const attempt = () => {
      setRetrying(true);
      onRetry();
    };

    window.addEventListener("online", attempt);

    // A guarded poll: a severed RSC stream or a dead socket often never fires
    // `online`, so retry on a slow cadence while the fallback is mounted. The
    // parent remounts the subtree on success and this component unmounts.
    const timer = window.setInterval(() => {
      if (navigator.onLine) onRetry();
    }, 8_000);

    return () => {
      window.removeEventListener("online", attempt);
      window.clearInterval(timer);
    };
  }, [onRetry]);

  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  return (
    <section className="connection-fallback" role="alert" aria-live="polite">
      <span
        className="connection-fallback-dot"
        data-state={offline ? "offline" : "reconnecting"}
        aria-hidden="true"
      />
      <div className="connection-fallback-copy">
        <h2>{title ?? (offline ? "انقطع الاتصال بالشبكة" : "جارٍ إعادة الاتصال")}</h2>
        <p>
          {offline
            ? "تعذّر الوصول إلى الخادم. سيُستأنف التحميل تلقائياً عند عودة الاتصال."
            : "انقطع الاتصال بالخادم أثناء تحميل البيانات. نحاول إعادة الاتصال تلقائياً."}
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        disabled={retrying}
        onClick={() => {
          setRetrying(true);
          onRetry();
        }}
      >
        {retrying ? "جارٍ المحاولة…" : "إعادة المحاولة الآن"}
      </Button>
    </section>
  );
}
