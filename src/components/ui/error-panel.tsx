"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Shared segment boundary body.
 *
 * Every route segment that reads the database gets its own `error.tsx`, but they
 * must all behave the same: keep the shell mounted, say plainly that the data
 * could not be prepared, and offer one retry. The retry re-renders only the
 * failed segment, which is the difference between a slow query and a dead page.
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
  useEffect(() => {
    console.error(error);
  }, [error]);

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
