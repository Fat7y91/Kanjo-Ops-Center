"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

/**
 * Field-ops boundary.
 *
 * The board joins tasks, cities, merchants and visit reports in one render; a
 * failing join must not take the rep's whole session down with it.
 */
export default function FieldOpsError({
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
      title="تعذر تحميل لوحة التنفيذ"
      description="لم يكتمل تجهيز مهام اليوم وحالات التجار. أعد المحاولة للحصول على اللوحة المحدثة."
    />
  );
}
