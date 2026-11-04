"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

/** Segment boundary: a failed read keeps the shell and every other module live. */
export default function AgentKpiError({
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
      title="تعذر تحميل مؤشرات الأداء"
      description="لم تكتمل قراءة مؤشرات الأداء. أعد المحاولة بعد لحظات."
    />
  );
}
