"use client";

import type { ReactNode } from "react";

import { ExecutiveDashboard } from "@/components/bi/executive-dashboard";
import { useOverviewDataset } from "@/components/bi/use-overview-dataset";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Skeleton, StatGridSkeleton } from "@/components/ui/skeletons";

/**
 * Dashboard island.
 *
 * The page renders the title block and this container; the facts arrive from
 * `/api/bi/overview`. Keeping the header outside the loading branch means the
 * operator sees the screen they asked for on the first paint, then the widgets
 * fill in — instead of a blank route that resolves all at once.
 */
export function OverviewDashboard({ header }: { header: ReactNode }) {
  const { status, dataset, error, reload } = useOverviewDataset();

  if (status === "loading") {
    return (
      <div className="bi-dashboard" aria-busy="true">
        <div className="bi-sticky-head">{header}</div>
        <OverviewSkeleton />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="bi-dashboard">
        <div className="bi-sticky-head">{header}</div>
        <ErrorPanel
          error={error}
          reset={reload}
          title="تعذر تحميل بيانات لوحة القيادة"
          description="لم تكتمل قراءة بيانات الشبكة والمالية والتسويق. أعد المحاولة دون مغادرة الصفحة."
        />
      </div>
    );
  }

  return <ExecutiveDashboard dataset={dataset} header={header} />;
}

/** Mirrors the route-level `loading.tsx` so the wait looks the same either way. */
function OverviewSkeleton() {
  return (
    <>
      <StatGridSkeleton count={4} />
      <section
        className="two-column grid grid-cols-1 gap-4 lg:grid-cols-2"
        aria-hidden="true"
      >
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="panel skeleton-card">
            <Skeleton width="38%" height="13px" />
            <Skeleton width="86%" height="10px" />
            <Skeleton width="72%" height="10px" />
            <Skeleton width="64%" height="10px" />
          </div>
        ))}
      </section>
    </>
  );
}
