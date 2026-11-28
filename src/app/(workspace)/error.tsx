"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

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
  return (
    <ErrorPanel
      error={error}
      reset={reset}
      title="تعذر عرض هذه الصفحة"
      description="حدث خطأ غير متوقع أثناء تجهيز البيانات. يمكنك إعادة المحاولة الآن."
    />
  );
}
