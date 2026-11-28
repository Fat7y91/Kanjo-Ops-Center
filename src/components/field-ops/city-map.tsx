"use client";

import dynamic from "next/dynamic";

import type { CityMapProps } from "@/components/field-ops/city-map-types";

const CityMapClient = dynamic(
  () => import("@/components/field-ops/city-map-inner"),
  {
    ssr: false,
    loading: () => (
      <div
        className="city-map city-map-loading"
        aria-label="جارٍ تحميل الخريطة"
        style={{ height: 320, width: "100%", minHeight: 320 }}
      />
    ),
  },
);

export function CityMap(props: CityMapProps) {
  return <CityMapClient {...props} />;
}

export type { CityMapProps };
