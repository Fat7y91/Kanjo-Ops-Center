"use client";

import {
  CATALOG_FILTER_ORDER,
  catalogFilterCounts,
  type CatalogFilter,
} from "@/lib/catalog/filters";
import { PRODUCT_STATE_META, type CatalogProduct } from "@/lib/catalog/types";

type CatalogFilterTabsProps = {
  products: readonly CatalogProduct[];
  active: CatalogFilter;
  onChange: (filter: CatalogFilter) => void;
};

const FILTER_LABEL: Record<CatalogFilter, string> = {
  all: "الكل",
  draft: PRODUCT_STATE_META.draft.label,
  pending_review: PRODUCT_STATE_META.pending_review.label,
  completed: PRODUCT_STATE_META.completed.label,
  published: PRODUCT_STATE_META.published.label,
};

/**
 * Status summary as interactive filter tabs.
 *
 * Zero-count states stay visible but disabled so the reviewer keeps a stable
 * mental map of the pipeline instead of tabs appearing and disappearing.
 */
export function CatalogFilterTabs({
  products,
  active,
  onChange,
}: CatalogFilterTabsProps) {
  const counts = catalogFilterCounts(products);

  return (
    <div
      className="cat-filter-tabs"
      role="tablist"
      aria-label="تصفية المنتجات حسب الحالة"
    >
      {CATALOG_FILTER_ORDER.map((filter) => {
        const count = counts[filter];
        const disabled = filter !== "all" && count === 0;
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={active === filter}
            className={`cat-filter-tab${active === filter ? " is-active" : ""}`}
            onClick={() => onChange(filter)}
            disabled={disabled}
          >
            <span>{FILTER_LABEL[filter]}</span>
            <span className="cat-filter-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
