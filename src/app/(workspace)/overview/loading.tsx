import {
  PageHeaderSkeleton,
  StatGridSkeleton,
} from "@/components/ui/skeletons";

export default function OverviewLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <section className="two-column grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="panel skeleton-card" aria-hidden="true">
            <span className="skeleton" style={{ width: "38%", height: 13 }} />
            <span className="skeleton" style={{ width: "86%", height: 10 }} />
            <span className="skeleton" style={{ width: "72%", height: 10 }} />
            <span className="skeleton" style={{ width: "64%", height: 10 }} />
          </div>
        ))}
      </section>
    </>
  );
}
