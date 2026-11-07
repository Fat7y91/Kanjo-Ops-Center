/**
 * Pure helpers for the V1 dashboard CSV sync.
 *
 * Everything here is deterministic and side-effect free so it can run on the
 * client (parse + preview) and the server (re-derive ids before writing), and
 * be unit tested without Supabase. The id formula is the same one the seed
 * migration uses: md5("kanjo-taxonomy-v1:<vendor_type_id>:<numeric id>")
 * formatted as a uuid. Vendor scope is folded in because the dashboard's
 * numeric ids repeat across vendor types.
 */

import { md5Hex } from "./md5";

export function taxonomyUuid(vendorTypeId: number, numericId: number): string {
  const hash = md5Hex(`kanjo-taxonomy-v1:${vendorTypeId}:${numericId}`);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

/** One row of `categories.csv` after normalisation. */
export type CategoryCsvRow = {
  numericId: number;
  parentNumericId: number | null;
  vendorTypeId: number;
  nameAr: string;
  nameEn: string;
};

/** One row of `vendor-types.csv` after normalisation. */
export type VendorTypeCsvRow = {
  numericId: number;
  nameAr: string;
  nameEn: string;
};

export type CsvSyncIssue = {
  file: string;
  line: number;
  message: string;
};

export type ParsedCsv<T> = {
  rows: T[];
  issues: CsvSyncIssue[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPositiveInt(value: unknown): number | null {
  const text = clean(value);
  if (text === "") return null;
  const numeric = Number(text);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

/**
 * Reads a field by trying several header spellings. The dashboard has exported
 * both snake_case and camelCase columns over time, so be forgiving.
 */
function field(
  row: Record<string, unknown>,
  ...names: string[]
): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return undefined;
}

export function parseVendorTypes(
  rows: Record<string, unknown>[],
): ParsedCsv<VendorTypeCsvRow> {
  const out: ParsedCsv<VendorTypeCsvRow> = { rows: [], issues: [] };
  rows.forEach((row, index) => {
    const numericId = toPositiveInt(field(row, "id", "vendor_type_id", "vendorTypeId"));
    const nameAr = clean(field(row, "name_ar", "nameAr", "name"));
    const nameEn = clean(field(row, "name_en", "nameEn", "name_en_us"));
    if (numericId == null) {
      out.issues.push({ file: "vendor-types.csv", line: index + 2, message: "معرّف غير صالح." });
      return;
    }
    if (!nameAr) {
      out.issues.push({ file: "vendor-types.csv", line: index + 2, message: "الاسم العربي مفقود." });
      return;
    }
    out.rows.push({ numericId, nameAr, nameEn });
  });
  return out;
}

export function parseCategories(
  rows: Record<string, unknown>[],
): ParsedCsv<CategoryCsvRow> {
  const out: ParsedCsv<CategoryCsvRow> = { rows: [], issues: [] };
  rows.forEach((row, index) => {
    const numericId = toPositiveInt(field(row, "id", "category_id", "categoryId"));
    const vendorTypeId = toPositiveInt(
      field(row, "vendor_type", "vendor_type_id", "vendorTypeId"),
    );
    const parentNumericId = toPositiveInt(field(row, "parent_id", "parentId"));
    const nameAr = clean(field(row, "name_ar", "nameAr", "name"));
    const nameEn = clean(field(row, "name_en", "nameEn", "name_en_us"));

    if (numericId == null) {
      out.issues.push({ file: "categories.csv", line: index + 2, message: "معرّف التصنيف غير صالح." });
      return;
    }
    if (vendorTypeId == null) {
      out.issues.push({ file: "categories.csv", line: index + 2, message: "نوع التاجر مفقود أو غير صالح." });
      return;
    }
    if (!nameAr) {
      out.issues.push({ file: "categories.csv", line: index + 2, message: "الاسم العربي مفقود." });
      return;
    }
    out.rows.push({ numericId, parentNumericId, vendorTypeId, nameAr, nameEn });
  });
  return out;
}

/** A variant-attribute row: one option belonging to a variant group. */
export type VariantAttributeCsvRow = {
  variantId: number;
  variantNameAr: string;
  variantNameEn: string;
  optionId: number;
  optionNameAr: string;
  optionNameEn: string;
};

export function parseVariantAttributes(
  rows: Record<string, unknown>[],
): ParsedCsv<VariantAttributeCsvRow> {
  const out: ParsedCsv<VariantAttributeCsvRow> = { rows: [], issues: [] };
  rows.forEach((row, index) => {
    const variantId = toPositiveInt(field(row, "variant_id", "variantId", "group_id"));
    const optionId = toPositiveInt(field(row, "option_id", "optionId", "id"));
    const variantNameAr = clean(field(row, "variant_name_ar", "variantNameAr", "group_name_ar"));
    const optionNameAr = clean(field(row, "option_name_ar", "optionNameAr", "name_ar", "name"));

    if (variantId == null || optionId == null) {
      out.issues.push({ file: "variant-attributes.csv", line: index + 2, message: "معرّف المتغير أو الخيار غير صالح." });
      return;
    }
    if (!optionNameAr) {
      out.issues.push({ file: "variant-attributes.csv", line: index + 2, message: "اسم الخيار مفقود." });
      return;
    }
    out.rows.push({
      variantId,
      variantNameAr,
      variantNameEn: clean(field(row, "variant_name_en", "variantNameEn", "group_name_en")),
      optionId,
      optionNameAr,
      optionNameEn: clean(field(row, "option_name_en", "optionNameEn", "name_en")),
    });
  });
  return out;
}
