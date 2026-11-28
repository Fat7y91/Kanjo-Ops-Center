"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

/** Catalog boundary: merchant state plus product aggregation for one segment. */
export default function CatalogError({
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
      title="تعذر تحميل الكتالوج"
      description="لم تكتمل قراءة حالات التجار ومنتجاتهم. أعد المحاولة بعد لحظات."
    />
  );
}
