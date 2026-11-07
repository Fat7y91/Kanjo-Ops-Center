/**
 * Turns parsed CSV rows into an upsert plan.
 *
 * The taxonomy table keys on a deterministic uuid and stores `vendor_type` as
 * text (the Arabic name, matching the seed) plus a derived `level`. Level is not
 * in the dashboard export, so it is computed from the parent chain within a
 * vendor scope. Unknown parents degrade to level 1 instead of throwing: a sync
 * should import what it can and report what it could not resolve.
 */

import {
  taxonomyUuid,
  type CategoryCsvRow,
  type ParsedCsv,
} from "./parse";

export type CategoryUpsertPlan = {
  id: string;
  parent_id: string | null;
  vendor_type: string;
  name_ar: string;
  name_en: string;
  level: number;
};

export type CategoryPlanResult = {
  rows: CategoryUpsertPlan[];
  duplicates: number;
  unresolvedParents: number;
};

/**
 * Builds an upsert plan from parsed categories. `vendorNames` maps numeric
 * vendor type ids to their Arabic name so `vendor_type` matches the seed's text
 * column. Later rows with the same (vendor, numeric id) overwrite earlier ones:
 * the export's last word wins, matching how the dashboard edits a row in place.
 */
export function buildCategoryPlan(
  parsed: ParsedCsv<CategoryCsvRow>,
  vendorNames: Map<number, string>,
): CategoryPlanResult {
  const byKey = new Map<string, CategoryCsvRow>();
  let duplicates = 0;
  let unresolvedParents = 0;

  for (const row of parsed.rows) {
    const key = `${row.vendorTypeId}:${row.numericId}`;
    if (byKey.has(key)) duplicates += 1;
    byKey.set(key, row);
  }

  const levelCache = new Map<string, number>();

  const hasParent = (row: CategoryCsvRow): boolean =>
    row.parentNumericId != null &&
    byKey.has(`${row.vendorTypeId}:${row.parentNumericId}`);

  const levelOf = (row: CategoryCsvRow, stack: Set<string>): number => {
    const key = `${row.vendorTypeId}:${row.numericId}`;
    const cached = levelCache.get(key);
    if (cached !== undefined) return cached;

    if (!hasParent(row)) {
      levelCache.set(key, 1);
      return 1;
    }
    if (stack.has(key)) return 1; // cycle guard
    const parent = byKey.get(`${row.vendorTypeId}:${row.parentNumericId}`)!;
    stack.add(key);
    const level = levelOf(parent, stack) + 1;
    stack.delete(key);
    levelCache.set(key, level);
    return level;
  };

  const rows: CategoryUpsertPlan[] = [];
  for (const row of byKey.values()) {
    const vendorName = vendorNames.get(row.vendorTypeId);
    // A parent that is not in this export cannot be linked: writing a uuid that
    // does not exist would either violate a self-referential FK or dangle. The
    // row is imported as a root instead, and the count is reported above.
    const parentResolved = hasParent(row);
    if (row.parentNumericId != null && !parentResolved) unresolvedParents += 1;
    rows.push({
      id: taxonomyUuid(row.vendorTypeId, row.numericId),
      parent_id: parentResolved
        ? taxonomyUuid(row.vendorTypeId, row.parentNumericId as number)
        : null,
      vendor_type: vendorName ?? String(row.vendorTypeId),
      name_ar: row.nameAr,
      name_en: row.nameEn,
      level: levelOf(row, new Set()),
    });
  }

  rows.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
  return { rows, duplicates, unresolvedParents };
}
