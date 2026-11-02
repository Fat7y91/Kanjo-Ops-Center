"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Segment boundary for the workspace shell.
 *
 * A rendering exception inside one page must not blank the whole app: the
 * shell (navigation, session, theme) stays mounted and the user is offered a
 * retry that re-renders the failed segment. Kept at the workspace level so
 * every module gets it, not only the operations logger that first surfaced
 * the crash.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="panel" role="alert">
      <div className="panel-head">
        <h2>تعذر عرض هذه الصفحة</h2>
      </div>
      <p className="muted">
        حدث خطأ غير متوقع أثناء تجهيز البيانات. يمكنك إعادة المحاولة الآن.
      </p>
      <div className="form-actions">
        <Button variant="primary" onClick={() => reset()}>
          إعادة المحاولة
        </Button>
      </div>
    </section>
  );
}
