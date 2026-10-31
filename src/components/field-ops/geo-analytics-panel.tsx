"use client";

import { useEffect, useState } from "react";

import type { ZonePoint } from "@/components/field-ops/city-map-types";
import type {
  GeoCompetitionLevel,
  GeoIntelligence,
} from "@/lib/geo/types";

const COMPETITION_TONE: Record<GeoCompetitionLevel, string> = {
  low: "badge-green",
  medium: "badge-purple",
  high: "badge-red",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export type GeoAnalyticsPanelProps = {
  zone: ZonePoint[];
  cityId?: string;
  enabled: boolean;
};

export function GeoAnalyticsPanel({
  zone,
  cityId,
  enabled,
}: GeoAnalyticsPanelProps) {
  const [analytics, setAnalytics] = useState<GeoIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || zone.length < 3) {
      setAnalytics(null);
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
            analysis?: GeoIntelligence;
            error?: string;
          };
          if (!response.ok || !payload.analysis) {
            throw new Error(payload.error ?? "تعذر حساب تحليلات النطاق.");
          }
          setAnalytics(payload.analysis);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setError(
            caught instanceof Error
              ? caught.message
              : "تعذر حساب تحليلات النطاق.",
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
          <p className="eyebrow">تحليلات النطاق الفورية</p>
          <h3>ذكاء السوق داخل الحدود المرسومة</h3>
        </div>
        {analytics ? (
          <span
            className={`badge ${COMPETITION_TONE[analytics.competition.level]}`}
          >
            منافسة {analytics.competition.label}
          </span>
        ) : null}
      </div>

      {!enabled ? (
        <p className="field-hint">
          لا تملك صلاحية عرض تحليلات المدينة الحالية.
        </p>
      ) : zone.length < 3 ? (
        <p className="field-hint">
          ارسم ثلاثة نقاط على الأقل لعرض تقديرات السكان والتجار ومؤشر المنافسة.
        </p>
      ) : error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : loading || !analytics ? (
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
              <span className="detail-label">المساحة التقديرية</span>
              <strong>
                {new Intl.NumberFormat("ar-EG-u-nu-latn", {
                  maximumFractionDigits: 2,
                }).format(analytics.areaKm2)}{" "}
                كم²
              </strong>
              <span className="stat-hint">{analytics.city}</span>
            </article>
            <article className="geo-stat">
              <span className="detail-label">السكان المقدّرون</span>
              <strong>{formatNumber(analytics.population)}</strong>
              <span className="stat-hint">
                {formatNumber(analytics.households)} أسرة تقريباً
              </span>
            </article>
            <article className="geo-stat">
              <span className="detail-label">التجار المحتملون</span>
              <strong>{formatNumber(analytics.merchants.total)}</strong>
              <span className="stat-hint">
                مطاعم {formatNumber(analytics.merchants.restaurants)} · مقاهي{" "}
                {formatNumber(analytics.merchants.cafes)} · صيدليات{" "}
                {formatNumber(analytics.merchants.pharmacies)} · بقالة{" "}
                {formatNumber(analytics.merchants.groceries)}
              </span>
            </article>
            <article className="geo-stat">
              <span className="detail-label">مؤشر المنافسة</span>
              <strong>
                {formatNumber(analytics.competition.index)}
                <small> / 100</small>
              </strong>
              <span
                className={`badge ${COMPETITION_TONE[analytics.competition.level]}`}
              >
                {analytics.competition.label}
              </span>
            </article>
          </div>
          <p className="field-hint">
            {analytics.governorate} · كثافة تقديرية{" "}
            {formatNumber(analytics.densityPerKm2)} نسمة/كم²
          </p>
        </>
      )}
    </div>
  );
}
