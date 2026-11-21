import { detectPosColumns } from "./parse-columns";
import { dedupePosItems } from "./parse-pharmacy";
import {
  cleanCellText,
  isSummaryRow,
  looksLikeHeaderRow,
  parseBarcode,
  parsePriceMinor,
  parseQuantity,
  parseUnit,
} from "./parse-values";
import type {
  ParsedPosItem,
  ParsedPosSheet,
  SkippedPosRow,
} from "./types";

export type PosParseOptions = {
  /** Merge repeated codes/batches instead of importing them twice. */
  dedupe?: boolean;
};

export class PosParseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PosParseError";
    this.code = code;
  }
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((value) => cleanCellText(value) === "");
}

/**
 * Turns a sheet matrix into immutable merchant rows plus an audit of skipped
 * rows. Column detection is separate so both the profiler and the reader stay
 * testable without SheetJS or a browser.
 */
export function parsePosMatrix(
  matrix: unknown[][],
  sheetName = "",
  options: PosParseOptions = {},
): ParsedPosSheet {
  if (matrix.length === 0) {
    throw new PosParseError("EMPTY_FILE", "الملف لا يحتوي على صفوف.");
  }

  const detection = detectPosColumns(matrix);
  const { name, price, barcode, unit, company, quantity } = detection.columns;
  if (name === null || price === null) {
    throw new PosParseError(
      "COLUMNS_NOT_FOUND",
      "تعذر التعرف على عمودي اسم الصنف والسعر. تأكد من وجودهما في الملف.",
    );
  }

  const items: ParsedPosItem[] = [];
  const skipped: SkippedPosRow[] = [];
  const start = detection.headerRow === null ? 0 : detection.headerRow + 1;

  for (let index = start; index < matrix.length; index += 1) {
    const row = matrix[index] ?? [];
    if (isBlankRow(row)) continue;

    const rowNumber = index + 1;
    const rawName = cleanCellText(row[name]);
    const priceMinor = parsePriceMinor(row[price]);

    if (isSummaryRow(row)) {
      if (rawName) {
        skipped.push({
          row: rowNumber,
          name: rawName,
          reason: "صف إجمالي أو تذييل",
        });
      }
      continue;
    }

    if (detection.headerRow === null && priceMinor === null && looksLikeHeaderRow(row)) {
      skipped.push({
        row: rowNumber,
        name: rawName || "—",
        reason: "صف عنوان",
      });
      continue;
    }

    if (!rawName) {
      skipped.push({
        row: rowNumber,
        name: "—",
        reason: "اسم المنتج فارغ",
      });
      continue;
    }

    if (priceMinor === null) {
      skipped.push({
        row: rowNumber,
        name: rawName,
        reason: "السعر مفقود أو غير صالح",
      });
      continue;
    }

    items.push({
      row: rowNumber,
      name: rawName,
      priceMinor,
      barcode: barcode === null ? "" : parseBarcode(row[barcode]),
      unit: unit === null ? "" : parseUnit(row[unit]),
      company: company === null ? "" : cleanCellText(row[company]).slice(0, 160),
      quantity: quantity === null ? null : parseQuantity(row[quantity]),
    });
  }

  if (items.length === 0) {
    throw new PosParseError(
      "NO_VALID_ROWS",
      "لم يُعثر على صفوف صالحة تحتوي على اسم وسعر.",
    );
  }

  const deduped = options.dedupe ? dedupePosItems(items) : null;

  return {
    items: deduped?.items ?? items,
    skipped,
    columns: detection.columns,
    headerRow:
      detection.headerRow === null ? null : detection.headerRow + 1,
    sheetName,
    mergedDuplicates: deduped?.merged ?? 0,
  };
}
