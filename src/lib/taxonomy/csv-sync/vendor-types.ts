/**
 * Vendor-type resolution for the V1 CSV sync.
 *
 * `categories.csv` stores its vendor scope as whatever the exporter had at the
 * time: a numeric id, a slug key, or the Arabic/English display name. Resolution
 * therefore normalises the reference and looks it up against both the uploaded
 * `vendor-types.csv` and the vendor types already persisted in the database.
 */

import type {
  CategoryCsvRow,
  CsvSyncIssue,
  ParsedCsv,
  VendorTypeCsvRow,
} from "./parse";

export type VendorTypeRecord = {
  id: number;
  key: string;
  nameAr: string;
  nameEn: string;
};

export type VendorTypePlan = {
  rows: VendorTypeRecord[];
  created: VendorTypeRecord[];
  updated: VendorTypeRecord[];
  duplicates: number;
};

export type VendorCatalog = {
  records: VendorTypeRecord[];
  byId: Map<number, VendorTypeRecord>;
  byRef: Map<string, VendorTypeRecord>;
};

export type CategoryVendorResolution = {
  parsed: ParsedCsv<CategoryCsvRow>;
  vendorNames: Map<number, string>;
  unresolved: number;
};

export function normaliseVendorRef(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function aliases(record: VendorTypeRecord): string[] {
  return [
    String(record.id),
    record.key,
    record.nameAr,
    record.nameEn,
    slugify(record.nameEn),
    slugify(record.nameAr),
  ].filter((value) => value.trim() !== "");
}

/** Uploaded rows win over the persisted rows for the same reference. */
export function buildVendorCatalog(
  existing: readonly VendorTypeRecord[],
  uploaded: readonly VendorTypeRecord[],
): VendorCatalog {
  const byId = new Map<number, VendorTypeRecord>();
  const byRef = new Map<string, VendorTypeRecord>();

  for (const record of [...existing, ...uploaded]) {
    byId.set(record.id, record);
    for (const alias of aliases(record)) {
      byRef.set(normaliseVendorRef(alias), record);
    }
  }

  return { records: [...byId.values()], byId, byRef };
}

export function resolveVendorType(
  catalog: VendorCatalog,
  reference: string,
  numericId: number | null,
): VendorTypeRecord | null {
  if (numericId != null) {
    const byId = catalog.byId.get(numericId);
    if (byId) return byId;
  }
  return catalog.byRef.get(normaliseVendorRef(reference)) ?? null;
}

/**
 * Resolves every category row's vendor scope. Rows whose scope matches neither
 * the upload nor the database are removed with an actionable issue rather than
 * being written under a bare numeric label.
 */
export function resolveCategoryVendors(
  parsed: ParsedCsv<CategoryCsvRow>,
  catalog: VendorCatalog,
): CategoryVendorResolution {
  const rows: CategoryCsvRow[] = [];
  const issues: CsvSyncIssue[] = [...parsed.issues];
  const vendorNames = new Map<number, string>();
  let unresolved = 0;

  for (const row of parsed.rows) {
    const vendor = resolveVendorType(catalog, row.vendorTypeRef, row.vendorTypeId);
    if (!vendor) {
      unresolved += 1;
      issues.push({
        file: "categories.csv",
        line: row.line,
        message: `نوع تاجر غير موجود في القاعدة: ${row.vendorTypeRef} — ارفع vendor-types.csv أولاً`,
      });
      continue;
    }
    vendorNames.set(vendor.id, vendor.nameAr);
    rows.push({ ...row, vendorTypeId: vendor.id });
  }

  rows.sort((left, right) => left.line - right.line);
  return { parsed: { rows, issues }, vendorNames, unresolved };
}

/**
 * Computes which uploaded vendor types are new and which match a persisted row.
 * Matching by key avoids a unique-key collision when the dashboard renumbered
 * an existing type; the persisted id is kept so existing categories still link.
 */
export function planVendorTypes(
  uploaded: readonly VendorTypeCsvRow[],
  existing: readonly VendorTypeRecord[],
): VendorTypePlan {
  const byId = new Map<number, VendorTypeRecord>();
  const byKey = new Map<string, VendorTypeRecord>();
  for (const record of existing) {
    byId.set(record.id, record);
    if (record.key) byKey.set(record.key, record);
  }

  const rows = new Map<string, VendorTypeRecord>();
  let duplicates = 0;

  for (const row of uploaded) {
    const key = row.key || slugify(row.nameEn) || `vendor-${row.numericId}`;
    const matchByKey = key ? byKey.get(key) : undefined;
    const matchById = byId.get(row.numericId);
    const id = matchByKey?.id ?? matchById?.id ?? row.numericId;
    const record: VendorTypeRecord = {
      id,
      key: matchById?.key || key,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
    };
    if (rows.has(String(id))) duplicates += 1;
    rows.set(String(id), record);
  }

  const created: VendorTypeRecord[] = [];
  const updated: VendorTypeRecord[] = [];
  for (const record of rows.values()) {
    if (byId.has(record.id) || (record.key && byKey.has(record.key))) {
      updated.push(record);
    } else {
      created.push(record);
    }
  }

  return { rows: [...rows.values()], created, updated, duplicates };
}
