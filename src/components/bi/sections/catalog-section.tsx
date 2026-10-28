"use client";

import { MetricCard } from "@/components/bi/metric-card";
import { count, percent } from "@/lib/bi/format";
import { BI_CATALOG_META } from "@/lib/bi/types";
import type { CatalogSummary } from "@/lib/bi/select";

type CatalogSectionProps = {
  catalog: CatalogSummary;
  onDrill: (id: string) => void;
};

export function CatalogSection({ catalog, onDrill }: CatalogSectionProps) {
  const states = [
    { key: "published" as const, value: catalog.published },
    { key: "draft" as const, value: catalog.draft },
    { key: "missing" as const, value: catalog.missing },
  ];

  return (
    <section className="bi-section" aria-label="خط إدخال البيانات">
      <header className="bi-section-head">
        <div>
          <p className="eyebrow">إدخال البيانات</p>
          <h2>جاهزية الكتالوج</h2>
        </div>
        <span className="badge">{count(catalog.total)} سجل</span>
      </header>

      <div className="bi-grid">
        <MetricCard
          label="جاهزية الكتالوج"
          value={percent(catalog.readiness, 0)}
          detail="نسبة المنتجات المنشورة مقابل الإجمالي"
          tone={catalog.readiness >= 0.8 ? "green" : "gold"}
          span="lg"
          onOpen={() => onDrill("catalog-all")}
        >
          <div className="bi-stacked-bar" aria-hidden="true">
            {states.map((state) => (
              <span
                key={state.key}
                className={`bi-stacked-segment seg-${state.key}`}
                style={{
                  width: `${
                    catalog.total === 0
                      ? 0
                      : Math.round((state.value / catalog.total) * 100)
                  }%`,
                }}
              />
            ))}
          </div>
        </MetricCard>

        {states.map((state) => (
          <MetricCard
            key={state.key}
            label={BI_CATALOG_META[state.key].label}
            value={count(state.value)}
            detail={`${percent(
              catalog.total === 0 ? 0 : state.value / catalog.total,
              0,
            )} من السجلات`}
            tone={
              state.key === "published"
                ? "green"
                : state.key === "draft"
                  ? "gold"
                  : "red"
            }
            span="xs"
            onOpen={() => onDrill(`catalog-${state.key}`)}
          />
        ))}
      </div>
    </section>
  );
}
