"use client";

import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
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
    <Widget
      eyebrow="إدخال البيانات"
      title="جاهزية الكتالوج"
      span={6}
      badge={<span className="badge">{count(catalog.total)} سجل</span>}
    >
      <div className="bi-stat-cluster bi-stat-cluster-row">
        <WidgetStat
          label="الجاهزية"
          value={percent(catalog.readiness, 0)}
          detail="المنتجات المنشورة مقابل الإجمالي"
          tone={catalog.readiness >= 0.8 ? "green" : "gold"}
          progress={catalog.readiness}
          onOpen={() => onDrill("catalog-all")}
        />
        <WidgetDivider />
        {states.map((state) => (
          <WidgetStat
            key={state.key}
            label={BI_CATALOG_META[state.key].label}
            value={count(state.value)}
            detail={percent(
              catalog.total === 0 ? 0 : state.value / catalog.total,
              0,
            )}
            tone={
              state.key === "published"
                ? "green"
                : state.key === "draft"
                  ? "gold"
                  : "red"
            }
            onOpen={() => onDrill(`catalog-${state.key}`)}
          />
        ))}
      </div>

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
    </Widget>
  );
}
