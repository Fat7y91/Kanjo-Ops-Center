"use client";

import { useMemo, useState } from "react";

import type { CatalogMerchantCard } from "@/lib/catalog/merchants";
import { smartTextScore } from "@/lib/search/normalize";

/** Directory slices, in the order the filter tabs render them. */
export const DIRECTORY_FILTERS = [
  "all",
  "live",
  "pending",
  "empty",
] as const;

export type DirectoryFilter = (typeof DIRECTORY_FILTERS)[number];

export const DIRECTORY_FILTER_LABEL: Record<DirectoryFilter, string> = {
  all: "كل التجار",
  live: "منتجات منشورة",
  pending: "بانتظار المراجعة",
  empty: "بدون منتجات",
};

function matchesFilter(
  card: CatalogMerchantCard,
  filter: DirectoryFilter,
): boolean {
  if (filter === "live") return card.publishedCount > 0;
  if (filter === "pending") return card.pendingCount > 0;
  if (filter === "empty") return card.productCount === 0;
  return true;
}

/**
 * Search + tab state for the merchant directory.
 *
 * Search scores name, vendor type and city with the shared Arabic-normalising
 * matcher, so "قريه" finds "Cairo Fresh" and a typed city narrows the grid.
 */
export function useCatalogDirectory(cards: readonly CatalogMerchantCard[]) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");

  const counts = useMemo(() => {
    const result: Record<DirectoryFilter, number> = {
      all: cards.length,
      live: 0,
      pending: 0,
      empty: 0,
    };
    for (const card of cards) {
      if (card.publishedCount > 0) result.live += 1;
      if (card.pendingCount > 0) result.pending += 1;
      if (card.productCount === 0) result.empty += 1;
    }
    return result;
  }, [cards]);

  const visible = useMemo(() => {
    const term = query.trim();
    return cards.filter((card) => {
      if (!matchesFilter(card, filter)) return false;
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
