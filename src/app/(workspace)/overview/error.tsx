"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

/**
 * Overview is the Founder's landing surface, so it gets its own boundary instead
 * of relying on the workspace one: a failure building the BI snapshot must not
 * look like the whole console went down, and the retry re-runs only this
 * segment.
 */
export default function OverviewError({
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
      title="تعذر تجهيز لوحة القيادة"
      description="لم تكتمل قراءة بيانات الشبكة والمالية والتسويق. أعد المحاولة بعد لحظات."
    />
  );
}
