import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { parsePosMatrix } = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/autopilot/parse-pos.ts"),
);
const pharmacy = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/autopilot/parse-pharmacy.ts"),
);
const values = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/autopilot/parse-values.ts"),
);

function headerSheet(rows) {
  return [
    ["تقرير مخزون الصيدلية"],
    ["الكود", "اسم الصنف", "الشركة", "الوحدة", "الكمية", "سعر البيع"],
    ...rows,
  ];
}

test("detects pharmacy company and quantity columns and keeps them verbatim", () => {
  const matrix = headerSheet([
    ["6223000000017", "أموكسيسيلين 500 مجم", "جلاكسو", "شريط", "12", "45.50"],
    ["6223000000024", "باراسيتامول 500 مجم", "إيبيكو", "علبة", "0", "18"],
  ]);

  const parsed = parsePosMatrix(matrix, "المخزون");

  assert.equal(parsed.columns.company, 2);
  assert.equal(parsed.columns.quantity, 4);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].company, "جلاكسو");
  assert.equal(parsed.items[0].quantity, 12);
  assert.equal(parsed.items[1].quantity, 0);
  assert.equal(parsed.items[0].priceMinor, 4550);
});

test("merges repeated batches by code, keeps the highest price and sums stock", () => {
  const matrix = headerSheet([
    ["6223000000017", "أموكسيسيلين 500 مجم", "جلاكسو", "شريط", "6", "45.50"],
    ["6223000000017", "أموكسيسيلين 500 مجم", "جلاكسو", "شريط", "4", "47.00"],
    ["6223000000024", "باراسيتامول 500 مجم", "إيبيكو", "علبة", "3", "18"],
  ]);

  const parsed = parsePosMatrix(matrix, "المخزون", { dedupe: true });

  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.mergedDuplicates, 1);
  assert.equal(parsed.items[0].barcode, "6223000000017");
  assert.equal(parsed.items[0].quantity, 10);
  assert.equal(parsed.items[0].priceMinor, 4700);
});

test("deduplicates headerless pharmacy rows by normalized name when codes are absent", () => {
  const items = [
    {
      row: 1,
      name: "فيتامين سي 1000",
      priceMinor: 5000,
      barcode: "",
      unit: "علبة",
      company: "ناتشر ميد",
      quantity: 2,
    },
    {
      row: 2,
      name: "فيتامين سي 1000",
      priceMinor: 5200,
      barcode: "",
      unit: "",
      company: "",
      quantity: null,
    },
  ];

  const merged = pharmacy.dedupePosItems(items);

  assert.equal(merged.merged, 1);
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].priceMinor, 5200);
  assert.equal(merged.items[0].company, "ناتشر ميد");
  assert.equal(merged.items[0].quantity, 2);
});

test("stock filter drops zero-quantity rows but keeps unknown stock", () => {
  const items = [
    { row: 1, name: "أ", priceMinor: 100, barcode: "", unit: "", company: "", quantity: 0 },
    { row: 2, name: "ب", priceMinor: 100, barcode: "", unit: "", company: "", quantity: 5 },
    { row: 3, name: "ج", priceMinor: 100, barcode: "", unit: "", company: "", quantity: null },
  ];

  assert.equal(pharmacy.hasStockData(items), true);
  const inStock = pharmacy.inStockItems(items);
  assert.deepEqual(inStock.map((item) => item.name), ["ب", "ج"]);
});

test("parses stock as a non-negative integer and rejects signs or letters", () => {
  assert.equal(values.parseQuantity("١٢"), 12);
  assert.equal(values.parseQuantity("12.0"), 12);
  assert.equal(values.parseQuantity("1,200"), 1200);
  assert.equal(values.parseQuantity(0), 0);
  assert.equal(values.parseQuantity("-3"), null);
  assert.equal(values.parseQuantity("3 علبة"), null);
  assert.equal(values.parseQuantity(""), null);
});
