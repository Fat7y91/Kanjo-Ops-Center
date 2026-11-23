/**
 * Pure helpers for the V1 dashboard CSV sync.
 *
 * Everything here is deterministic and side-effect free so it can run on the
 * client (parse + preview) and the server (re-derive ids before writing), and
 * be unit tested without Supabase. The id formula is the same one the seed
 * migration uses: md5("kanjo-taxonomy-v1:<vendor_type_id>:<numeric id>")
 * formatted as a uuid. Vendor scope is folded in because the dashboard's
 * numeric ids repeat across vendor types.
 *
 * Live V1 exports arrive with a UTF-8 BOM and a `vendor_type` column that holds
 * a *reference* (numeric id, key, or Arabic/English name), not always a number.
 * Headers are normalised and the raw reference is preserved so it can be
 * resolved against the vendor-type catalog instead of silently dropping rows.
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
  /** Numeric id when the export is numeric; null when resolution is required. */
  vendorTypeId: number | null;
  /** Raw `vendor_type` value from the CSV (id, key, name_ar or name_en). */
  vendorTypeRef: string;
  nameAr: string;
  nameEn: string;
  line: number;
};

/** One row of `vendor-types.csv` after normalisation. */
export type VendorTypeCsvRow = {
  numericId: number;
  key: string;
  nameAr: string;
  nameEn: string;
  line: number;
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
  if (typeof value === "string") return value.replace(/^\uFEFF/, "").trim();
  // The browser parser yields strings, but a direct API call may send numbers.
  // Coerce finite numbers so a re-derivation from JSON is as forgiving as CSV.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toPositiveInt(value: unknown): number | null {
  const text = clean(value);
  if (text === "") return null;
  const numeric = Number(text);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

/** Strips a BOM and surrounding whitespace from every header key. */
function normaliseKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/^\uFEFF/, "").trim()] = value;
  }
  return out;
}

/**
 * Reads a field by trying several header spellings. The dashboard has exported
 * both snake_case and camelCase columns over time, so be forgiving.
 */
function field(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return undefined;
}

export function parseVendorTypes(
  rows: Record<string, unknown>[],
): ParsedCsv<VendorTypeCsvRow> {
  const out: ParsedCsv<VendorTypeCsvRow> = { rows: [], issues: [] };
  rows.forEach((raw, index) => {
    const row = normaliseKeys(raw);
    const line = index + 2;
    const numericId = toPositiveInt(
      field(row, "id", "vendor_type_id", "vendorTypeId"),
    );
    const nameEn = clean(field(row, "name_en", "nameEn", "name_en_us"));
    const nameAr =
      clean(field(row, "name_ar", "nameAr", "name")) || nameEn;
    const key = clean(field(row, "key", "slug", "vendor_type_key"));

    if (numericId == null) {
      out.issues.push({ file: "vendor-types.csv", line, message: "معرّف غير صالح." });
      return;
    }
    if (!nameAr) {
      out.issues.push({
        file: "vendor-types.csv",
        line,
        message: "الاسم العربي مفقود.",
      });
      return;
    }
    out.rows.push({ numericId, key, nameAr, nameEn, line });
  });
  return out;
}

export function parseCategories(
  rows: Record<string, unknown>[],
): ParsedCsv<CategoryCsvRow> {
  const out: ParsedCsv<CategoryCsvRow> = { rows: [], issues: [] };
  rows.forEach((raw, index) => {
    const row = normaliseKeys(raw);
    const line = index + 2;
    const numericId = toPositiveInt(field(row, "id", "category_id", "categoryId"));
    const parentNumericId = toPositiveInt(field(row, "parent_id", "parentId"));
    const nameAr = clean(field(row, "name_ar", "nameAr", "name"));
    const nameEn = clean(field(row, "name_en", "nameEn", "name_en_us"));
    const vendorTypeRef = clean(
      field(
        row,
        "vendor_type",
        "vendorType",
        "vendor_type_id",
        "vendorTypeId",
        "vendor_type_key",
        "vendorTypeKey",
        "vendor",
      ),
    );

    if (numericId == null) {
      out.issues.push({
        file: "categories.csv",
        line,
        message: "معرّف التصنيف غير صالح.",
      });
      return;
    }
    if (!vendorTypeRef) {
      out.issues.push({
        file: "categories.csv",
        line,
        message: "نوع التاجر مفقود.",
      });
      return;
    }
    if (!nameAr) {
      out.issues.push({
        file: "categories.csv",
        line,
        message: "الاسم العربي مفقود.",
      });
      return;
    }
    out.rows.push({
      numericId,
      parentNumericId,
      vendorTypeId: toPositiveInt(vendorTypeRef),
      vendorTypeRef,
      nameAr,
      nameEn,
      line,
    });
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
  line: number;
};

export function parseVariantAttributes(
  rows: Record<string, unknown>[],
): ParsedCsv<VariantAttributeCsvRow> {
  const out: ParsedCsv<VariantAttributeCsvRow> = { rows: [], issues: [] };
  rows.forEach((raw, index) => {
    const row = normaliseKeys(raw);
    const line = index + 2;
    const variantId = toPositiveInt(field(row, "variant_id", "variantId", "group_id"));
    const optionId = toPositiveInt(field(row, "option_id", "optionId", "id"));
    const variantNameAr = clean(
      field(row, "variant_name_ar", "variantNameAr", "group_name_ar"),
    );
    const optionNameAr = clean(
      field(row, "option_name_ar", "optionNameAr", "name_ar", "name"),
    );

    if (variantId == null || optionId == null) {
      out.issues.push({
        file: "variant-attributes.csv",
        line,
        message: "معرّف المتغير أو الخيار غير صالح.",
      });
      return;
    }
    if (!optionNameAr) {
      out.issues.push({
        file: "variant-attributes.csv",
        line,
        message: "اسم الخيار مفقود.",
      });
      return;
    }
    out.rows.push({
      variantId,
      variantNameAr,
      variantNameEn: clean(
        field(row, "variant_name_en", "variantNameEn", "group_name_en"),
      ),
      optionId,
      optionNameAr,
      optionNameEn: clean(field(row, "option_name_en", "optionNameEn", "name_en")),
      line,
    });
  });
  return out;
}
