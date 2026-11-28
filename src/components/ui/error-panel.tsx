"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ConnectionFallback } from "@/components/ui/connection-fallback";
import { isConnectionError, isOffline } from "@/lib/errors/connection";

/**
 * Shared segment boundary body.
 *
 * Every route segment that reads the database gets its own `error.tsx`, but they
 * must all behave the same: keep the shell mounted, say plainly that the data
 * could not be prepared, and offer one retry. The retry re-renders only the
 * failed segment, which is the difference between a slow query and a dead page.
 *
 * A dropped connection is not a defect: it renders the reconnecting surface and
 * retries automatically instead of asking the operator to reload a page that
 * will fail again while the link is down.
 */
export function ErrorPanel({
  error,
  reset,
  title,
  description,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
}) {
  const connection = isConnectionError(error) || isOffline();

  useEffect(() => {
    // Connection noise is expected; only log genuine rendering defects.
    if (!connection) console.error(error);
  }, [error, connection]);

  if (connection) {
    return <ConnectionFallback onRetry={reset} />;
  }

  return (
    <section className="panel" role="alert">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <p className="muted">{description}</p>
      <div className="form-actions">
        <Button variant="primary" onClick={() => reset()}>
          إعادة المحاولة
        </Button>
      </div>
    </section>
  );
}
