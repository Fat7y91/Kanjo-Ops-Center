"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

/** Segment boundary: a failed read keeps the shell and every other module live. */
export default function AdminError({
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
      title="تعذر تحميل الإدارة"
      description="لم تكتمل قراءة بيانات الإدارة والصلاحيات. أعد المحاولة بعد لحظات."
    />
  );
}
