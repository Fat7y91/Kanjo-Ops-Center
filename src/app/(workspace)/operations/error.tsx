"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

/** Segment boundary: a failed read keeps the shell and every other module live. */
export default function OperationsError({
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
      title="تعذر تحميل سجل العمليات"
      description="لم تكتمل قراءة سجل العمليات. أعد المحاولة بعد لحظات."
    />
  );
}
