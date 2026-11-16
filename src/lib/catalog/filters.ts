import { normalizeSearchText } from "@/lib/search/normalize";
import type { CatalogProduct, CatalogProductState } from "@/lib/catalog/types";

/** Filter tab identity: every state plus an "all" pseudo-state. */
export type CatalogFilter = "all" | CatalogProductState;

export const CATALOG_FILTER_ORDER: readonly CatalogFilter[] = [
  "all",
  "pending_review",
  "completed",
  "published",
];

/** Only surface tabs that can ever match, but always keep "all". */
export function catalogFilterCounts(
  products: readonly CatalogProduct[],
): Record<CatalogFilter, number> {
  const counts: Record<CatalogFilter, number> = {
    all: products.length,
    pending_review: 0,
    completed: 0,
    published: 0,
  };
  for (const product of products) counts[product.state] += 1;
  return counts;
}

export function filterProducts(
  products: readonly CatalogProduct[],
  filter: CatalogFilter,
): CatalogProduct[] {
  if (filter === "all") return [...products];
  return products.filter((product) => product.state === filter);
}

/**
 * Free-text filter for the merchant product grid.
 *
 * Matches the product name and its category name (or raw category key) so a
 * reviewer can type "مخبوزات" or part of the product name. Both sides go
 * through the shared Arabic normaliser, so hamza/alef variants and diacritics
 * do not hide a match.
 */
export function filterProductsBySearch(
  products: readonly CatalogProduct[],
  query: string,
  categoryNames: ReadonlyMap<string, string> = new Map(),
): CatalogProduct[] {
  const term = normalizeSearchText(query);
  if (!term) return [...products];

  return products.filter((product) => {
    const category = product.categoryKey
      ? categoryNames.get(product.categoryKey) ?? product.categoryKey
      : "";
    const categoryKey = product.categoryKey ?? "";
    return (
      normalizeSearchText(product.name).includes(term) ||
      normalizeSearchText(category).includes(term) ||
      normalizeSearchText(categoryKey).includes(term)
    );
  });
}
