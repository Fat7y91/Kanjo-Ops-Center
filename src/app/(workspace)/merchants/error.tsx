"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

/**
 * Directory boundary.
 *
 * The directory request reads merchant state for the whole visible network, so
 * it is the first screen to feel a database that is slow or temporarily
 * unreachable. Retrying re-runs only this segment; the workspace shell, the
 * session and the navigation stay intact.
 */
export default function MerchantsError({
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
      title="تعذر تحميل دليل التجار"
      description="لم تكتمل قراءة حالات التجار من قاعدة البيانات. أعد المحاولة، وإذا تكرر الأمر فالاتصال بالخدمة بطيء حالياً."
    />
  );
}
