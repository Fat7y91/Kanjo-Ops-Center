import { normalizeSearchText } from "@/lib/search/normalize";
import type { CatalogProduct, CatalogProductState } from "@/lib/catalog/types";

/**
 * Filter tab identity: every lifecycle state plus the importer's QA views.
 * `no_image` and `needs_review` are cross-state views used after a pharmacy
 * import, so they intentionally overlap the state tabs.
 */
export type CatalogFilter =
  | "all"
  | "no_image"
  | "needs_review"
  | CatalogProductState;

export const CATALOG_FILTER_ORDER: readonly CatalogFilter[] = [
  "all",
  "pending_review",
  "no_image",
  "needs_review",
  "completed",
  "published",
];

function hasImage(product: CatalogProduct): boolean {
  return Boolean(product.imageDataUrl?.trim());
}

function needsReview(product: CatalogProduct): boolean {
  return product.qaMetadata?.autopilot_needs_review === true;
}

function matches(product: CatalogProduct, filter: CatalogFilter): boolean {
  if (filter === "all") return true;
  if (filter === "no_image") return !hasImage(product);
  if (filter === "needs_review") return needsReview(product);
  return product.state === filter;
}

export function catalogFilterCounts(
  products: readonly CatalogProduct[],
): Record<CatalogFilter, number> {
  const counts: Record<CatalogFilter, number> = {
    all: products.length,
    pending_review: 0,
    no_image: 0,
    needs_review: 0,
    completed: 0,
    published: 0,
  };
  for (const product of products) counts[product.state] += 1;
  for (const product of products) {
    if (!hasImage(product)) counts.no_image += 1;
    if (needsReview(product)) counts.needs_review += 1;
  }
  return counts;
}

export function filterProducts(
  products: readonly CatalogProduct[],
  filter: CatalogFilter,
): CatalogProduct[] {
  return products.filter((product) => matches(product, filter));
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
