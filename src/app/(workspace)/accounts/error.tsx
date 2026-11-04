"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

/** Segment boundary: a failed read keeps the shell and every other module live. */
export default function AccountsError({
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
      title="تعذر تحميل الحسابات البنكية"
      description="لم تكتمل قراءة الأرصدة والحركات. أعد المحاولة بعد لحظات."
    />
  );
}
