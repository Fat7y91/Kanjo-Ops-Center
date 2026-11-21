import {
  CATEGORY_SEED,
  VARIANT_SEED,
  VENDOR_TYPE_SEED,
} from "@/lib/taxonomy/data.generated";
import {
  categoryKey,
  type TaxonomyCategory,
  type TaxonomyRequest,
  type TaxonomyVariant,
  type TaxonomyVendorType,
} from "@/lib/taxonomy/types";

/**
 * In-memory taxonomy store and the helpers every read/write module shares.
 *
 * The store lives on `globalThis` so a hot reload keeps the same maps instead
 * of reseeding behind a live screen. Only the taxonomy package's own modules
 * import this file; callers use the `store.ts` barrel.
 */

export type TaxonomyStore = {
  vendorTypes: Map<number, TaxonomyVendorType>;
  categories: Map<string, TaxonomyCategory>;
  variants: Map<number, TaxonomyVariant>;
  requests: TaxonomyRequest[];
  revision: number;
};

export type TaxonomySnapshot = {
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  revision: number;
};

export type TaxonomyRequestActor = {
  id: string;
  name: string;
};

const globalStore = globalThis as typeof globalThis & {
  __kanjoV2TaxonomyStore?: TaxonomyStore;
};

export function isoNow(): string {
  return new Date().toISOString();
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function requestId(): string {
  return `taxreq-${crypto.randomUUID().slice(0, 8)}`;
}

function seedStore(): TaxonomyStore {
  const createdAt = new Date(0).toISOString();
  const vendorTypes = new Map<number, TaxonomyVendorType>(
    VENDOR_TYPE_SEED.map((vendor) => [
      vendor.id,
      {
        id: vendor.id,
        name_ar: vendor.name_ar,
        name_en: vendor.name_en,
        active: true,
        source: "dashboard" as const,
        createdAt,
        updatedAt: createdAt,
      },
    ]),
  );

  const categories = new Map<string, TaxonomyCategory>(
    CATEGORY_SEED.map((category) => [
      categoryKey(category.vendor_type_id, category.id),
      {
        key: categoryKey(category.vendor_type_id, category.id),
        id: category.id,
        vendorTypeId: category.vendor_type_id,
        parentId: category.parent_id,
        name_ar: category.name_ar,
        name_en: category.name_en,
        sortOrder: category.sort_order,
        active: category.active,
        source: "dashboard" as const,
        createdAt,
        updatedAt: createdAt,
      },
    ]),
  );

  const variants = new Map<number, TaxonomyVariant>(
    VARIANT_SEED.map((variant) => [
      variant.variant_id,
      {
        variant_id: variant.variant_id,
        name_ar: variant.name_ar,
        name_en: variant.name_en,
        options: variant.options.map((option) => ({
          ...option,
          aliases: [...option.aliases],
        })),
        active: true,
        source: "dashboard" as const,
        createdAt,
        updatedAt: createdAt,
      },
    ]),
  );

  // The review queue starts empty: a pending request is a real operator
  // submission, not demo content. The vendor-type/category/variant catalogue
  // above is generated reference data (`data.generated.ts`).
  const requests: TaxonomyRequest[] = [];

  return { vendorTypes, categories, variants, requests, revision: 1 };
}

export function getStore(): TaxonomyStore {
  if (!globalStore.__kanjoV2TaxonomyStore) {
    globalStore.__kanjoV2TaxonomyStore = seedStore();
  }
  return globalStore.__kanjoV2TaxonomyStore;
}

export function bump(store: TaxonomyStore): void {
  store.revision += 1;
}

export function taxonomyRevision(): number {
  return getStore().revision;
}
