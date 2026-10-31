"use client";

import Link from "next/link";
import { useState } from "react";

import { usePermission } from "@/components/auth/use-permission";
import { CityMap } from "@/components/field-ops/city-map";
import { GeoAnalyticsPanel } from "@/components/field-ops/geo-analytics-lazy";
import { OpsTeamPanel } from "@/components/field-ops/ops-team-panel";
import {
  CITY_STAGE_META,
  type City,
} from "@/lib/field-ops/types";
import type { AppUser } from "@/lib/rbac/types";

type CityDetailsClientProps = {
  city: City;
  managers: AppUser[];
  assignable: AppUser[];
  canEdit: boolean;
};

type CityTab = "operations" | "intelligence";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function CityDetailsClient({
  city,
  managers,
  assignable,
  canEdit,
}: CityDetailsClientProps) {
  const { hasPermission } = usePermission();
  const [tab, setTab] = useState<CityTab>("operations");
  const meta = CITY_STAGE_META[city.stage];
  const canAnalyze = hasPermission("view_city_analytics");
  const centroid =
    city.zone.length > 0
      ? ([
          city.zone.reduce((sum, point) => sum + point.lat, 0) / city.zone.length,
          city.zone.reduce((sum, point) => sum + point.lng, 0) / city.zone.length,
        ] as [number, number])
      : undefined;

  return (
    <>
      <section className="profile-hero panel">
        <div>
          <p className="eyebrow">
            {city.governorate} · {city.country}
          </p>
          <h2>{city.name}</h2>
          <div className="profile-badges">
            <span className={`badge ${meta.tone}`}>{meta.label}</span>
            <span className="badge">{formatNumber(city.population)} نسمة</span>
            <span className="badge">
              {formatNumber(managers.length)} مدير تشغيل
            </span>
            <span className="badge">{formatNumber(city.zone.length)} نقطة حدود</span>
          </div>
        </div>
        <div className="profile-actions">
          <Link className="button button-quiet" href="/cities" prefetch>
            العودة إلى المدن
          </Link>
          {canEdit ? (
            <Link className="button button-primary" href="/cities" prefetch>
              تعديل المدينة
            </Link>
          ) : null}
        </div>
      </section>

      <div className="city-tabs" role="tablist" aria-label="أقسام المدينة">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "operations"}
          className={`city-tab${tab === "operations" ? " is-active" : ""}`}
          onClick={() => setTab("operations")}
        >
          إدارة التشغيل
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "intelligence"}
          className={`city-tab${tab === "intelligence" ? " is-active" : ""}`}
          onClick={() => setTab("intelligence")}
        >
          ذكاء النطاق
        </button>
      </div>

      <div className="city-details-grid">
        <div className="city-details-main">
          {tab === "operations" ? (
            <OpsTeamPanel
              cityId={city.id}
              initialManagers={managers}
              assignable={assignable}
              cityName={city.name}
            />
          ) : canAnalyze ? (
            <GeoAnalyticsPanel
              zone={city.zone}
              cityId={city.id}
              enabled
            />
          ) : (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">ذكاء النطاق</p>
                  <h2>التحليلات غير متاحة</h2>
                </div>
              </div>
              <p className="panel-note">
                تحتاج صلاحية عرض تحليلات المدينة للاطلاع على تقديرات السوق
                داخل هذا النطاق.
              </p>
            </section>
          )}
        </div>

        <aside className="city-details-side">
          <CityMap
            draft={city.zone}
            height={260}
            center={centroid ?? [30.0444, 31.2357]}
            focus={centroid}
          />
          <section className="panel city-summary">
            <p className="eyebrow">ملخص تشغيلي</p>
            <h2>بيانات المدينة</h2>
            <div className="detail-grid detail-grid-wide city-summary-grid">
              <div>
                <span className="detail-label">المرحلة</span>
                <strong>{meta.label}</strong>
              </div>
              <div>
                <span className="detail-label">مديرو التشغيل</span>
                <strong>{managers.length}</strong>
              </div>
              <div>
                <span className="detail-label">التجار المسجلون</span>
                <strong>{formatNumber(city.competitors.length)} منافس</strong>
              </div>
              <div>
                <span className="detail-label">أنشئت بواسطة</span>
                <strong>{city.createdByName}</strong>
              </div>
            </div>
            <p className="city-notes">{city.strategicNotes || "لا ملاحظات استراتيجية."}</p>
          </section>
        </aside>
      </div>
    </>
  );
}
