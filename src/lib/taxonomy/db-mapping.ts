import type {
  TaxonomyCategory,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

/**
 * Maps the synced taxonomy tables onto the dashboard read model.
 *
 * The V1 exports carry their own numeric ids in `vendor_type_id`/`numeric_id`.
 * The generated seed rows have no such scope, so they are not part of the
 * dashboard snapshot. Keeping this pure lets the mapping be unit tested without
 * a database connection.
 */

export type VendorTypeDbRow = {
  id: number;
  name_ar: string;
  name_en: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CategoryDbRow = {
  id: string;
  parent_id: string | null;
  vendor_type: string;
  vendor_type_id: number | null;
  numeric_id: number | null;
  name_ar: string;
  name_en: string | null;
  level: number | null;
  source?: string | null;
};

const EPOCH = new Date(0).toISOString();

export function toTaxonomyVendorType(
  row: VendorTypeDbRow,
): TaxonomyVendorType {
  return {
    id: Number(row.id),
    name_ar: row.name_ar,
    name_en: row.name_en ?? "",
    active: true,
    source: "dashboard",
    createdAt: row.created_at ?? EPOCH,
    updatedAt: row.updated_at ?? EPOCH,
  };
}

export function toTaxonomyCategories(
  rows: readonly CategoryDbRow[],
): TaxonomyCategory[] {
  const numericByUuid = new Map(
    rows.map((row) => [row.id, Number(row.numeric_id)] as const),
  );

  return rows
    .filter(
      (row) =>
        row.source === "v1" &&
        row.vendor_type_id != null &&
        row.numeric_id != null,
    )
    .map((row) => {
      const vendorTypeId = Number(row.vendor_type_id);
      const numericId = Number(row.numeric_id);
      return {
        key: row.id,
        id: numericId,
        vendorTypeId,
        parentId:
          row.parent_id != null ? (numericByUuid.get(row.parent_id) ?? null) : null,
        name_ar: row.name_ar,
        name_en: row.name_en ?? "",
        sortOrder: row.level ?? 1,
        active: true,
        source: "dashboard" as const,
        createdAt: EPOCH,
        updatedAt: EPOCH,
      };
    })
    .sort(
      (left, right) =>
        left.vendorTypeId - right.vendorTypeId ||
        left.sortOrder - right.sortOrder ||
        left.id - right.id,
    );
}
