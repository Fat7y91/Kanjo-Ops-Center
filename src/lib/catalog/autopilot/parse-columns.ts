import { normalizeSearchText } from "@/lib/search/normalize";

import { cleanCellText } from "./parse-values";
import {
  detectByProfile,
  emptyColumns,
  type ColumnDetection,
} from "./parse-columns-profile";
import {
  POS_COLUMN_FIELDS,
  type PosColumnField,
  type PosColumnMap,
} from "./types";

/**
 * Column detection for messy POS exports.
 *
 * A header row wins when it names both the item and the price. Otherwise value
 * profiling (in `parse-columns-profile.ts`) infers the columns. Merge cells and
 * spacer columns simply produce empty profiles.
 */

const HEADER_ALIASES: Record<PosColumnField, string[]> = {
  name: [
    "اسم الصنف",
    "اسم المنتج",
    "اسم المادة",
    "الصنف",
    "المنتج",
    "البيان",
    "item name",
    "product name",
    "description",
    "item",
  ],
  price: [
    "متوسط سعر البيع",
    "سعر البيع",
    "سعر القطعة",
    "سعر الوحدة",
    "السعر",
    "سعر",
    "unit price",
    "sale price",
    "price",
  ],
  barcode: [
    "الباركود",
    "باركود",
    "كود الصنف",
    "كود المنتج",
    "الكود",
    "كود",
    "barcode",
    "bar code",
    "sku",
    "code",
  ],
  unit: [
    "الوحدة",
    "الوحده",
    "وحدة القياس",
    "وحده القياس",
    "الوحدة",
    "unit",
    "uom",
  ],
  company: [
    "الشركة",
    "شركة",
    "المصنع",
    "التوكيل",
    "الوكيل",
    "company",
    "manufacturer",
    "brand",
  ],
  quantity: [
    "الكمية",
    "الكميه",
    "الرصيد",
    "المخزون",
    "العدد",
    "quantity",
    "qty",
    "stock",
    "on hand",
    "balance",
  ],
};

const FIELDS = POS_COLUMN_FIELDS;

function normalizedAliases(field: PosColumnField): string[] {
  return HEADER_ALIASES[field].map(normalizeSearchText).filter(Boolean);
}

function matchField(cell: string): PosColumnField | null {
  const value = normalizeSearchText(cell);
  if (!value) return null;
  for (const field of FIELDS) {
    const aliases = normalizedAliases(field);
    if (aliases.some((alias) => value === alias)) return field;
  }
  for (const field of FIELDS) {
    const aliases = normalizedAliases(field);
    if (aliases.some((alias) => alias.length >= 3 && value.includes(alias))) {
      return field;
    }
  }
  return null;
}

function headerMapping(row: unknown[]): PosColumnMap {
  const columns = emptyColumns();
  row.forEach((value, index) => {
    const field = matchField(cleanCellText(value));
    if (field && columns[field] === null) columns[field] = index;
  });
  return columns;
}

function mapScore(columns: PosColumnMap): number {
  let score = 0;
  for (const field of FIELDS) if (columns[field] !== null) score += 1;
  if (columns.name !== null && columns.price !== null) score += 3;
  return score;
}

function detectHeader(matrix: unknown[][]): ColumnDetection | null {
  let best: { row: number; columns: PosColumnMap; score: number } | null = null;
  const limit = Math.min(matrix.length, 40);
  for (let row = 0; row < limit; row += 1) {
    const columns = headerMapping(matrix[row] ?? []);
    if (columns.name === null || columns.price === null) continue;
    const score = mapScore(columns);
    if (!best || score > best.score) best = { row, columns, score };
  }
  return best ? { headerRow: best.row, columns: best.columns } : null;
}

export type { ColumnDetection };

export function detectPosColumns(matrix: unknown[][]): ColumnDetection {
  const header = detectHeader(matrix);
  if (header) return header;
  const profile = detectByProfile(matrix);
  if (profile) return profile;
  return { headerRow: null, columns: emptyColumns() };
}
