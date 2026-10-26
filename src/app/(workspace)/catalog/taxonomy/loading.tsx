import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function TaxonomyLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <section className="panel" aria-hidden="true">
        <div className="skeleton-inline">
          <span className="skeleton" style={{ width: 108, height: 30 }} />
          <span className="skeleton" style={{ width: 108, height: 30 }} />
          <span className="skeleton" style={{ width: 108, height: 30 }} />
        </div>
      </section>
      <TableSkeleton rows={7} columns={4} />
    </>
  );
}
