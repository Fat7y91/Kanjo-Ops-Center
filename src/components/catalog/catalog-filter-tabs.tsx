"use client";

import { Tabs } from "@/components/ui/tabs";
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
 * Status summary rendered with the shared `Tabs` primitive.
 *
 * Zero-count states stay visible but disabled so the reviewer keeps a stable
 * mental map of the pipeline instead of tabs appearing and disappearing. The
 * tab panels are intentionally empty: the grid below renders the filtered list.
 */
export function CatalogFilterTabs({
  products,
  active,
  onChange,
}: CatalogFilterTabsProps) {
  const counts = catalogFilterCounts(products);
  const selectedIndex = Math.max(
    CATALOG_FILTER_ORDER.indexOf(active),
    0,
  );

  return (
    <Tabs
      items={CATALOG_FILTER_ORDER.map((filter) => ({
        id: filter,
        label: FILTER_LABEL[filter],
        badge: counts[filter],
        disabled: filter !== "all" && counts[filter] === 0,
        content: null,
      }))}
      selectedIndex={selectedIndex}
      onChange={(index) => {
        const next = CATALOG_FILTER_ORDER[index];
        if (next) onChange(next);
      }}
      showPanels={false}
      listClassName="rounded-full bg-[color:var(--surface)] p-1 shadow-sm"
    />
  );
}
