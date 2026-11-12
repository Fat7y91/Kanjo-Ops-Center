"use client";

import { useEffect, useState } from "react";

import type { ZonePoint } from "@/components/field-ops/city-map-types";
import type { GeoZoneGeometry } from "@/lib/geo/types";

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("ar-EG-u-nu-latn", {
    maximumFractionDigits: digits,
  }).format(value);
}

export type GeoAnalyticsPanelProps = {
  zone: ZonePoint[];
  cityId?: string;
  enabled: boolean;
};

/**
 * Zone geometry readout.
 *
 * Shows only measurable facts about the drawn boundary: area, perimeter, the
 * centroid coordinates and the governorate the boundary sits inside. Nothing
 * here estimates demand or competition, because those figures were modelled
 * guesses rather than measured data. Real merchant counts live in the merchants
 * directory.
 */
export function GeoAnalyticsPanel({
  zone,
  cityId,
  enabled,
}: GeoAnalyticsPanelProps) {
  const [geometry, setGeometry] = useState<GeoZoneGeometry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || zone.length < 3) {
      setGeometry(null);
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const ring = [
        ...zone.map((point) => [point.lng, point.lat] as [number, number]),
        [zone[0].lng, zone[0].lat] as [number, number],
      ];

      void fetch("/api/geo-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          polygon: { type: "Polygon", coordinates: [ring] },
          datasetCityId: cityId || undefined,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            analysis?: GeoZoneGeometry;
            error?: string;
          };
          if (!response.ok || !payload.analysis) {
            throw new Error(payload.error ?? "تعذر حساب قياسات النطاق.");
          }
          setGeometry(payload.analysis);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setError(
            caught instanceof Error
              ? caught.message
              : "تعذر حساب قياسات النطاق.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, zone, cityId]);

  return (
    <div className="geo-analytics">
      <div className="geo-analytics-head">
        <div>
          <p className="eyebrow">قياسات النطاق</p>
          <h3>قياسات الحدود المرسومة</h3>
        </div>
        {geometry ? (
          <span className="badge">{geometry.governorate}</span>
        ) : null}
      </div>

      {!enabled ? (
        <p className="field-hint">
          لا تملك صلاحية عرض قياسات المدينة الحالية.
        </p>
      ) : zone.length < 3 ? (
        <p className="field-hint">
          ارسم ثلاثة نقاط على الأقل لعرض مساحة النطاق ومحيطه وإحداثيات مركزه.
        </p>
      ) : error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : loading || !geometry ? (
        <div className="geo-stats" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="geo-stat is-loading">
              <span className="skeleton skeleton-sm" />
              <span className="skeleton skeleton-lg" />
              <span className="skeleton skeleton-md" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="geo-stats">
            <article className="geo-stat">
              <span className="detail-label">المساحة</span>
              <strong>
                {formatNumber(geometry.areaKm2, 2)}
                <small> كم²</small>
              </strong>
              <span className="stat-hint">{geometry.city}</span>
            </article>
            <article className="geo-stat">
              <span className="detail-label">المحيط</span>
              <strong>
                {formatNumber(geometry.perimeterKm, 2)}
                <small> كم</small>
              </strong>
              <span className="stat-hint">
                {formatNumber(geometry.vertexCount)} نقطة حدود
              </span>
            </article>
            <article className="geo-stat">
              <span className="detail-label">مركز النطاق</span>
              <strong>
                {geometry.centroid.lat.toFixed(4)},{" "}
                {geometry.centroid.lng.toFixed(4)}
              </strong>
              <span className="stat-hint">
                خط العرض, خط الطول
              </span>
            </article>
            <article className="geo-stat">
              <span className="detail-label">المحافظة</span>
              <strong>{geometry.governorate}</strong>
              <span className="stat-hint">{geometry.city}</span>
            </article>
          </div>
          <p className="field-hint">
            قياسات هندسية مباشرة للحدود المرسومة. أعداد التجار تُقرأ من دليل
            التجار المسجّلين، وليست تقديرات.
          </p>
        </>
      )}
    </div>
  );
}
