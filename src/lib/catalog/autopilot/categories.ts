import { listCategories } from "@/lib/taxonomy/store";

import type { TaxonomyCategory } from "@/lib/taxonomy/types";

export const PHARMACY_VENDOR_TYPE_ID = 3;
export const SUPERMARKET_VENDOR_TYPE_ID = 4;

/** Vendor types whose POS workbook can run through the autopilot importer. */
export const AUTOPILOT_VENDOR_TYPE_IDS: readonly number[] = [
  PHARMACY_VENDOR_TYPE_ID,
  SUPERMARKET_VENDOR_TYPE_ID,
];

/**
 * Safe aisle for an item the model could not place, chosen per vendor type so a
 * pharmacy never receives a grocery category (and vice versa).
 */
const FALLBACK_CATEGORY_ID: Record<number, number> = {
  [PHARMACY_VENDOR_TYPE_ID]: 26, // مستلزمات
  [SUPERMARKET_VENDOR_TYPE_ID]: 32, // بقالة
};

export function isAutopilotVendorType(vendorTypeId: number): boolean {
  return AUTOPILOT_VENDOR_TYPE_IDS.includes(vendorTypeId);
}

/** Active categories offered to the importer for a vendor type. */
export function autopilotCategories(
  vendorTypeId: number,
): TaxonomyCategory[] {
  return listCategories(vendorTypeId).filter((category) => category.active);
}

export function autopilotCategoryKeys(vendorTypeId: number): string[] {
  return autopilotCategories(vendorTypeId).map((category) => category.key);
}

export function defaultAutopilotCategoryKey(vendorTypeId: number): string {
  const categories = autopilotCategories(vendorTypeId);
  const preferredId = FALLBACK_CATEGORY_ID[vendorTypeId];
  return (
    categories.find((category) => category.id === preferredId)?.key ??
    categories[0]?.key ??
    `${vendorTypeId}-${preferredId ?? 0}`
  );
}

export function validAutopilotCategoryKey(
  vendorTypeId: number,
  value: string | null | undefined,
  fallback = defaultAutopilotCategoryKey(vendorTypeId),
): string {
  if (
    value &&
    autopilotCategories(vendorTypeId).some((category) => category.key === value)
  ) {
    return value;
  }
  return fallback;
}

/** Supermarket wrappers kept for existing call sites and tests. */
export function supermarketCategories(): TaxonomyCategory[] {
  return autopilotCategories(SUPERMARKET_VENDOR_TYPE_ID);
}

export function supermarketCategoryKeys(): string[] {
  return autopilotCategoryKeys(SUPERMARKET_VENDOR_TYPE_ID);
}

export function defaultSupermarketCategoryKey(): string {
  return defaultAutopilotCategoryKey(SUPERMARKET_VENDOR_TYPE_ID);
}

export function validSupermarketCategoryKey(
  value: string | null | undefined,
  fallback = defaultSupermarketCategoryKey(),
): string {
  return validAutopilotCategoryKey(
    SUPERMARKET_VENDOR_TYPE_ID,
    value,
    fallback,
  );
}
