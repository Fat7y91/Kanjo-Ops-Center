import type { CatalogMerchantCard } from "./merchants";

/** Legacy V1 operational slices, in the order the catalog tabs render them. */
export const DIRECTORY_FILTERS = [
  "all",
  "complete",
  "processing",
  "empty",
  "under_contract",
  "delete_requests",
] as const;

export type DirectoryFilter = (typeof DIRECTORY_FILTERS)[number];

export const DIRECTORY_FILTER_LABEL: Record<DirectoryFilter, string> = {
  all: "كل التجار",
  complete: "مكتمل بالكامل",
  processing: "قيد المعالجة",
  empty: "بدون منتجات",
  under_contract: "تحت التعاقد",
  delete_requests: "طلبات حذف",
};

/**
 * A merchant is complete once it has products and none of them are still
 * waiting for review. Contract state is intentionally not part of this test:
 * the workflow answers "is the catalog finished?", not "is the deal signed?".
 */
export function matchesDirectoryFilter(
  card: CatalogMerchantCard,
  filter: DirectoryFilter,
): boolean {
  if (filter === "complete") {
    return card.productCount > 0 && card.pendingCount === 0;
  }
  if (filter === "processing") return card.pendingCount > 0;
  if (filter === "empty") return card.productCount === 0;
  if (filter === "under_contract") return card.contractState === "provisional";
  if (filter === "delete_requests") return card.deleteRequestCount > 0;
  return true;
}

export function directoryFilterCounts(
  cards: readonly CatalogMerchantCard[],
): Record<DirectoryFilter, number> {
  const counts = Object.fromEntries(
    DIRECTORY_FILTERS.map((filter) => [filter, 0]),
  ) as Record<DirectoryFilter, number>;

  for (const card of cards) {
    for (const filter of DIRECTORY_FILTERS) {
      if (matchesDirectoryFilter(card, filter)) counts[filter] += 1;
    }
  }
  return counts;
}
