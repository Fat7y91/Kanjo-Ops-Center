"use client";

import { parsePosMatrix, PosParseError } from "./parse-pos";
import type { ParsedPosSheet } from "./types";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function matrixFromSheet(
  XLSX: typeof import("xlsx"),
  sheet: import("xlsx").WorkSheet,
): unknown[][] {
  const reference = sheet["!ref"];
  if (!reference) return [];
  const range = XLSX.utils.decode_range(reference);
  const matrix: unknown[][] = Array.from(
    { length: range.e.r + 1 },
    () => [] as unknown[],
  );
  for (let row = 0; row <= range.e.r; row += 1) {
    for (let column = 0; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      matrix[row][column] = cell ? (cell.v ?? "") : null;
    }
  }
  return matrix;
}

async function csvText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1256").decode(bytes);
    } catch {
      return new TextDecoder("latin1").decode(bytes);
    }
  }
}

/**
 * Reads an .xls/.xlsx/.csv file in the browser with SheetJS, then hands the
 * matrix to the pure parser. Keeping SheetJS on the client avoids a Node-only
 * dependency on the edge runtime and lets the operator see the detection result
 * before starting the enrichment batches.
 */
export async function parsePosFile(file: File): Promise<ParsedPosSheet> {
  if (file.size === 0) {
    throw new PosParseError("EMPTY_FILE", "الملف فارغ.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new PosParseError(
      "FILE_TOO_LARGE",
      "حجم الملف أكبر من 20 ميجابايت. قسّم الملف ثم أعد المحاولة.",
    );
  }

  let XLSX: typeof import("xlsx");
  let workbook: import("xlsx").WorkBook;
  try {
    XLSX = await import("xlsx");
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv")) {
      workbook = XLSX.read(await csvText(file), {
        type: "string",
        cellDates: false,
      });
    } else {
      workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
        type: "array",
        cellDates: false,
      });
    }
  } catch (error) {
    if (error instanceof PosParseError) throw error;
    throw new PosParseError(
      "UNREADABLE_FILE",
      "تعذر قراءة الملف. تأكد أنه ملف Excel أو CSV صالح.",
    );
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = matrixFromSheet(XLSX, sheet);
    if (matrix.every((row) => row.every((value) => !value))) continue;
    return parsePosMatrix(matrix, sheetName);
  }

  throw new PosParseError("EMPTY_FILE", "الملف لا يحتوي على أوراق بها بيانات.");
}
