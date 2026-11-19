import { listCategories } from "@/lib/taxonomy/store";

import type { TaxonomyCategory } from "@/lib/taxonomy/types";

export const SUPERMARKET_VENDOR_TYPE_ID = 4;

/** Supermarket aisles offered to Tier 2 and used to validate every key. */
export function supermarketCategories(): TaxonomyCategory[] {
  return listCategories(SUPERMARKET_VENDOR_TYPE_ID).filter(
    (category) => category.active,
  );
}

export function supermarketCategoryKeys(): string[] {
  return supermarketCategories().map((category) => category.key);
}

/** Grocery is the safe aisle for an item the model could not place. */
export function defaultSupermarketCategoryKey(): string {
  const categories = supermarketCategories();
  return (
    categories.find((category) => category.id === 32)?.key ??
    categories[0]?.key ??
    "4-32"
  );
}

export function validSupermarketCategoryKey(
  value: string | null | undefined,
  fallback = defaultSupermarketCategoryKey(),
): string {
  if (value && supermarketCategories().some((category) => category.key === value)) {
    return value;
  }
  return fallback;
}
