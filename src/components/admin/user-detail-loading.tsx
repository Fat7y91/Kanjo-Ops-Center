import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeletons";

/**
 * Instant skeleton for /admin/users/[id].
 *
 * Streams immediately on navigation so the click feels instant while the user's
 * capability grid is fetched; the shell stays interactive.
 */
export function UserDetailLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <section className="panel" aria-hidden="true">
        <div className="skeleton-toolbar">
          <Skeleton width="min(240px, 50vw)" height="22px" radius="8px" />
          <Skeleton width="96px" height="32px" radius="10px" />
        </div>
        <div className="matrix-groups grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, groupIndex) => (
            <div key={groupIndex} className="matrix-group">
              <Skeleton width="42%" height="12px" />
              <div className="matrix-perms">
                {Array.from({ length: 4 }).map((_, rowIndex) => (
                  <Skeleton key={rowIndex} width="72%" height="11px" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
