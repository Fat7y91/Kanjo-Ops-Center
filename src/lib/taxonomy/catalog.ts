import { normalizeSearchText } from "@/lib/search/normalize";
import { TaxonomyError } from "@/lib/taxonomy/errors";
import {
  clone,
  getStore,
  taxonomyRevision,
  type TaxonomySnapshot,
} from "@/lib/taxonomy/store-state";
import { categoryKey } from "@/lib/taxonomy/types";
import type {
  TaxonomyCategory,
  TaxonomyVariant,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

/**
 * Read model for the central catalog: vendor types, categories and variants.
 *
 * Rows are cloned on the way out so a caller can never mutate the shared store
 * by holding on to one. These are pure queries; the request queue lives in
 * `requests.ts`.
 */

export function listVendorTypes(): TaxonomyVendorType[] {
  return clone(
    Array.from(getStore().vendorTypes.values()).sort(
      (left, right) => left.id - right.id,
    ),
  );
}

export function listCategories(vendorTypeId?: number): TaxonomyCategory[] {
  const all = Array.from(getStore().categories.values());
  const scoped =
    vendorTypeId === undefined
      ? all
      : all.filter((category) => category.vendorTypeId === vendorTypeId);
  return clone(
    scoped.sort(
      (left, right) =>
        left.vendorTypeId - right.vendorTypeId ||
        left.sortOrder - right.sortOrder ||
        left.id - right.id,
    ),
  );
}

export function listVariants(): TaxonomyVariant[] {
  return clone(
    Array.from(getStore().variants.values()).sort(
      (left, right) => left.variant_id - right.variant_id,
    ),
  );
}

export function taxonomySnapshot(): TaxonomySnapshot {
  return {
    vendorTypes: listVendorTypes(),
    categories: listCategories(),
    variants: listVariants(),
    revision: taxonomyRevision(),
  };
}

export function getVendorType(id: number): TaxonomyVendorType | null {
  const vendor = getStore().vendorTypes.get(id);
  return vendor ? clone(vendor) : null;
}

export function getCategory(
  vendorTypeId: number,
  id: number,
): TaxonomyCategory | null {
  const category = getStore().categories.get(categoryKey(vendorTypeId, id));
  return category ? clone(category) : null;
}

export function findVendorTypeByName(name: string): TaxonomyVendorType | null {
  const target = normalizeSearchText(name);
  if (!target) return null;
  for (const vendor of getStore().vendorTypes.values()) {
    if (
      normalizeSearchText(vendor.name_ar) === target ||
      normalizeSearchText(vendor.name_en) === target
    ) {
      return clone(vendor);
    }
  }
  return null;
}

export function assertVendorTypeExists(id: number): TaxonomyVendorType {
  const vendor = getStore().vendorTypes.get(id);
  if (!vendor) {
    throw new TaxonomyError(
      "VENDOR_TYPE_NOT_FOUND",
      "نوع التاجر غير موجود في التصنيف المركزي.",
      404,
    );
  }
  return clone(vendor);
}

export function assertCategoryInVendor(
  vendorTypeId: number,
  categoryId: number,
): TaxonomyCategory {
  const category = getStore().categories.get(
    categoryKey(vendorTypeId, categoryId),
  );
  if (!category) {
    throw new TaxonomyError(
      "CATEGORY_NOT_IN_VENDOR_SCOPE",
      "التصنيف غير تابع لنوع التاجر المحدد.",
      422,
    );
  }
  return clone(category);
}
