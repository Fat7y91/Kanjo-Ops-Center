"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import type { GeoAnalyticsPanelProps } from "@/components/field-ops/geo-analytics-panel";

const GeoAnalyticsPanelClient = dynamic(
  () =>
    import("@/components/field-ops/geo-analytics-panel").then(
      (module) => module.GeoAnalyticsPanel,
    ),
  {
    ssr: false,
    loading: () => <GeoPanelSkeleton />,
  },
);

function GeoPanelSkeleton() {
  return (
    <section className="panel geo-analytics" aria-hidden="true">
      <div className="geo-analytics-head">
        <span className="skeleton" style={{ width: "42%", height: 14 }} />
      </div>
      <div className="geo-stats">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="geo-stat">
            <span className="skeleton" style={{ width: "50%", height: 9 }} />
            <span className="skeleton" style={{ width: "66%", height: 20 }} />
            <span className="skeleton" style={{ width: "80%", height: 9 }} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Code-split entry point for the market-intelligence panel.
 *
 * The panel fetches geo intelligence on mount, so it is never part of the
 * initial route payload. Suspense keeps the surrounding city UI paint-ready.
 */
export function GeoAnalyticsPanel(props: GeoAnalyticsPanelProps) {
  return (
    <Suspense fallback={<GeoPanelSkeleton />}>
      <GeoAnalyticsPanelClient {...props} />
    </Suspense>
  );
}
