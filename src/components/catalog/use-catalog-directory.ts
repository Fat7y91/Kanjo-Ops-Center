"use client";

import { useMemo, useState } from "react";

import {
  directoryFilterCounts,
  matchesDirectoryFilter,
  type DirectoryFilter,
} from "@/lib/catalog/directory-filters";
import type { CatalogMerchantCard } from "@/lib/catalog/merchants";
import { smartTextScore } from "@/lib/search/normalize";

export {
  DIRECTORY_FILTERS,
  DIRECTORY_FILTER_LABEL,
  type DirectoryFilter,
} from "@/lib/catalog/directory-filters";

/**
 * Search + tab state for the merchant directory.
 *
 * Search scores name, vendor type and city with the shared Arabic-normalising
 * matcher, so "قريه" finds "Cairo Fresh" and a typed city narrows the grid.
 */
export function useCatalogDirectory(cards: readonly CatalogMerchantCard[]) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");

  const counts = useMemo(() => directoryFilterCounts(cards), [cards]);

  const visible = useMemo(() => {
    const term = query.trim();
    return cards.filter((card) => {
      if (!matchesDirectoryFilter(card, filter)) return false;
      if (!term) return true;
      const score = Math.max(
        smartTextScore(term, card.name).score,
        Math.round(smartTextScore(term, card.vendorType).score * 0.6),
        Math.round(smartTextScore(term, card.cityName).score * 0.5),
      );
      return score > 0;
    });
  }, [cards, filter, query]);

  return { query, setQuery, filter, setFilter, counts, visible };
}
