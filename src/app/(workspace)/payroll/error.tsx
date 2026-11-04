"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

/** Segment boundary: a failed read keeps the shell and every other module live. */
export default function PayrollError({
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
      title="تعذر تحميل مسير الرواتب"
      description="لم تكتمل قراءة كشوف الرواتب والعمولات. أعد المحاولة بعد لحظات."
    />
  );
}
