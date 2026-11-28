import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import XLSX from "xlsx";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { parsePosMatrix, PosParseError } = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/autopilot/parse-pos.ts"),
);
const values = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/autopilot/parse-values.ts"),
);

function readMatrix(buffer, type = "buffer") {
  const workbook = XLSX.read(buffer, { type, cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const matrix = Array.from(
    { length: range.e.r + 1 },
    () => [],
  );
  for (let row = 0; row <= range.e.r; row += 1) {
    for (let column = 0; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      matrix[row][column] = cell ? (cell.v ?? "") : null;
    }
  }
  return { matrix, sheetName };
}

function workbookBuffer(rows, bookType) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "POS",
  );
  return XLSX.write(workbook, { bookType, type: "buffer" });
}

function buildWithHeader(count) {
  const rows = [
    [],
    ["تقرير مبيعات الفرع"],
    ["", "اسم الصنف", "الباركود", "متوسط سعر البيع", "الوحده", ""],
  ];
  for (let index = 0; index < count; index += 1) {
    rows.push([
      "",
      `منتج تجريبي ${index + 1} - 100 جم`,
      6223000000000 + index,
      10.25 + (index % 100),
      index % 2 === 0 ? "قطعة" : "كجم",
      "",
    ]);
  }
  rows.push(["", "إجمالى الموقع", "", 99999, "", ""]);
  return rows;
}

test("reads a 1,800-row legacy .xls with title, spacer column and footer", () => {
  const buffer = workbookBuffer(buildWithHeader(1800), "biff8");
  assert.ok(buffer.length > 10_000);

  const { matrix, sheetName } = readMatrix(buffer);
  const parsed = parsePosMatrix(matrix, sheetName);

  assert.equal(parsed.items.length, 1800);
  assert.equal(parsed.headerRow, 3);
  assert.equal(parsed.columns.name, 1);
  assert.equal(parsed.columns.barcode, 2);
  assert.equal(parsed.columns.price, 3);
  assert.equal(parsed.columns.unit, 4);
  assert.equal(parsed.items[0].barcode, "6223000000000");
  assert.equal(parsed.items[0].priceMinor, 1025);
  assert.equal(parsed.items[0].unit, "قطعة");
  assert.equal(parsed.items[1799].barcode, "6223000001799");
  assert.ok(parsed.skipped.some((row) => row.reason === "صف إجمالي أو تذييل"));
});

test("auto-detects columns in a 600-row .xlsx without a header row", () => {
  const rows = [];
  for (let index = 0; index < 600; index += 1) {
    rows.push([
      `جبنة بيضاء ${index + 1}`,
      index === 7 ? "" : 24.5 + index,
      `0012345${String(600000 + index).slice(-7)}`,
      index % 3 === 0 ? "كجم" : "ك*12",
    ]);
  }
  const buffer = workbookBuffer(rows, "xlsx");
  const { matrix, sheetName } = readMatrix(buffer);
  const parsed = parsePosMatrix(matrix, sheetName);

  assert.equal(parsed.headerRow, null);
  assert.equal(parsed.columns.name, 0);
  assert.equal(parsed.columns.price, 1);
  assert.equal(parsed.columns.barcode, 2);
  assert.equal(parsed.columns.unit, 3);
  assert.equal(parsed.items.length, 599);
  assert.equal(parsed.items[0].barcode, "0012345600000");
  assert.equal(parsed.items[0].priceMinor, 2450);
  assert.equal(parsed.skipped.length, 1);
  assert.match(parsed.skipped[0].reason, /السعر/);
});

test("keeps barcodes exact instead of scientific notation", () => {
  assert.equal(values.expandInteger(6223001234567), "6223001234567");
  assert.equal(values.expandInteger("6.223001234567e+12"), "6223001234567");
  assert.equal(values.parseBarcode("0012345678905"), "0012345678905");
  assert.equal(values.parseBarcode(6223001234567), "6223001234567");
  assert.equal(values.parseBarcode("123"), "");
});

test("parses Arabic money and rejects barcode-like prices", () => {
  assert.equal(values.parsePriceMinor("١٢٫٥٠"), 1250);
  assert.equal(values.parsePriceMinor("1,234.50 ج.م"), 123450);
  assert.equal(values.parsePriceMinor("12,50"), 1250);
  assert.equal(values.parsePriceMinor("1.234,50"), 123450);
  assert.equal(values.parsePriceMinor("6223001234567"), null);
  assert.equal(values.parsePriceMinor("—"), null);
  assert.equal(values.parsePriceMinor(0), null);
});

test("throws a readable error when name/price columns are missing", () => {
  assert.throws(
    () => parsePosMatrix([["كود", "ملاحظات"], ["12345678", "بدون سعر"]]),
    (error) =>
      error instanceof PosParseError &&
      error.code === "COLUMNS_NOT_FOUND",
  );
});
