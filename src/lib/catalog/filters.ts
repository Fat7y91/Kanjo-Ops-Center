import type { CatalogProduct, CatalogProductState } from "@/lib/catalog/types";

/** Filter tab identity: every state plus an "all" pseudo-state. */
export type CatalogFilter = "all" | CatalogProductState;

export const CATALOG_FILTER_ORDER: readonly CatalogFilter[] = [
  "all",
  "pending_review",
  "completed",
  "draft",
  "published",
];

/** Only surface tabs that can ever match, but always keep "all". */
export function catalogFilterCounts(
  products: readonly CatalogProduct[],
): Record<CatalogFilter, number> {
  const counts: Record<CatalogFilter, number> = {
    all: products.length,
    draft: 0,
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
