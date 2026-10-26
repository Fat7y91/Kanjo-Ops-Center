type SkeletonProps = {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
};

/**
 * Low-level shimmer block. Route-level loading boundaries compose these so the
 * shell stays interactive while the RSC payload for the content area streams.
 */
export function Skeleton({
  width = "100%",
  height = "12px",
  radius = "7px",
  className,
}: SkeletonProps) {
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function PageHeaderSkeleton() {
  return (
    <header className="page-header skeleton-header" aria-hidden="true">
      <div className="skeleton-header-copy">
        <Skeleton width="96px" height="9px" />
        <Skeleton width="min(420px, 62vw)" height="30px" radius="9px" />
        <Skeleton width="min(560px, 78vw)" height="11px" />
      </div>
      <div className="skeleton-header-actions">
        <Skeleton width="96px" height="34px" radius="10px" />
      </div>
    </header>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section className="stat-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="panel stat-card skeleton-card">
          <Skeleton width="58%" height="9px" />
          <Skeleton width="42%" height="26px" radius="8px" />
          <Skeleton width="70%" height="9px" />
        </div>
      ))}
    </section>
  );
}

export function TableSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <section className="panel" aria-hidden="true">
      <div className="skeleton-toolbar">
        <Skeleton width="min(320px, 60vw)" height="36px" radius="10px" />
        <Skeleton width="84px" height="34px" radius="10px" />
      </div>
      <div className="skeleton-table">
        <div
          className="skeleton-table-head"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} width="62%" height="9px" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="skeleton-table-row"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                width={columnIndex === 0 ? "82%" : "54%"}
                height="11px"
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="city-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="panel city-card skeleton-card">
          <Skeleton width="46%" height="9px" />
          <Skeleton width="68%" height="22px" radius="8px" />
          <div className="skeleton-inline">
            <Skeleton width="30%" height="34px" radius="9px" />
            <Skeleton width="30%" height="34px" radius="9px" />
            <Skeleton width="30%" height="34px" radius="9px" />
          </div>
          <Skeleton width="94%" height="9px" />
          <Skeleton width="72%" height="9px" />
        </div>
      ))}
    </section>
  );
}

export function MapSkeleton({ height = 360 }: { height?: number }) {
  return (
    <div
      className="panel skeleton-map"
      style={{ minHeight: height }}
      aria-hidden="true"
    >
      <Skeleton width="34%" height="12px" />
      <Skeleton width="100%" height={`${height - 92}px`} radius="12px" />
    </div>
  );
}

export function BoardSkeleton({ columns = 3 }: { columns?: number }) {
  return (
    <section className="board" aria-hidden="true">
      {Array.from({ length: columns }).map((_, columnIndex) => (
        <div key={columnIndex} className="board-column">
          <div className="board-head">
            <Skeleton width="56%" height="14px" />
            <Skeleton width="28px" height="20px" radius="8px" />
          </div>
          {Array.from({ length: 3 }).map((_, cardIndex) => (
            <div key={cardIndex} className="panel skeleton-card">
              <Skeleton width="66%" height="13px" />
              <Skeleton width="44%" height="9px" />
              <div className="skeleton-inline">
                <Skeleton width="38%" height="26px" radius="8px" />
                <Skeleton width="38%" height="26px" radius="8px" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

export function ProfileSkeleton() {
  return (
    <>
      <section className="profile-hero panel skeleton-card" aria-hidden="true">
        <div>
          <Skeleton width="120px" height="9px" />
          <Skeleton width="min(280px, 60vw)" height="28px" radius="9px" />
          <div className="skeleton-inline">
            <Skeleton width="76px" height="20px" radius="999px" />
            <Skeleton width="76px" height="20px" radius="999px" />
          </div>
        </div>
        <div className="skeleton-header-actions">
          <Skeleton width="120px" height="34px" radius="10px" />
        </div>
      </section>
      <section className="two-column grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="panel skeleton-card">
            <Skeleton width="42%" height="13px" />
            <Skeleton width="88%" height="10px" />
            <Skeleton width="76%" height="10px" />
            <Skeleton width="64%" height="10px" />
            <Skeleton width="70%" height="10px" />
          </div>
        ))}
      </section>
    </>
  );
}
