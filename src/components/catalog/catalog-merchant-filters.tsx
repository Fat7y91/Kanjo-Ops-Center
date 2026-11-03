"use client";

import { Tabs } from "@/components/ui/tabs";
import {
  DIRECTORY_FILTERS,
  DIRECTORY_FILTER_LABEL,
  type DirectoryFilter,
} from "@/components/catalog/use-catalog-directory";

type CatalogMerchantFiltersProps = {
  active: DirectoryFilter;
  counts: Record<DirectoryFilter, number>;
  onChange: (filter: DirectoryFilter) => void;
};

/**
 * Merchant directory slices rendered with the shared `Tabs` primitive.
 *
 * A slice with no merchants stays visible but disabled, so the tab track does
 * not reshuffle while a manager is scanning it.
 */
export function CatalogMerchantFilters({
  active,
  counts,
  onChange,
}: CatalogMerchantFiltersProps) {
  const selectedIndex = Math.max(DIRECTORY_FILTERS.indexOf(active), 0);

  return (
    <Tabs
      items={DIRECTORY_FILTERS.map((filter) => ({
        id: filter,
        label: DIRECTORY_FILTER_LABEL[filter],
        badge: counts[filter],
        disabled: filter !== "all" && counts[filter] === 0,
        content: null,
      }))}
      selectedIndex={selectedIndex}
      onChange={(index) => {
        const next = DIRECTORY_FILTERS[index];
        if (next) onChange(next);
      }}
      showPanels={false}
      listClassName="shadow-sm"
    />
  );
}
