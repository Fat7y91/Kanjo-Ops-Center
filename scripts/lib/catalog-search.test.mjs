import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { filterProductsBySearch, filterProducts, catalogFilterCounts } = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/filters.ts"),
);

function product(overrides = {}) {
  return {
    id: "P1",
    name: "شاي أخضر",
    description: "",
    merchantId: "M1",
    merchantName: "Merchant",
    vendorTypeId: 1,
    categoryKey: "drinks",
    productType: "simple",
    sku: "SKU-1",
    barcode: "",
    imageDataUrl: null,
    attributes: [],
    price: 100,
    state: "completed",
    reviewNote: "",
    enteredById: null,
    enteredByName: null,
    clientProductId: null,
    qaMetadata: {},
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

test("matches product names through Arabic normalisation", () => {
  const products = [product(), product({ id: "P2", name: "قهوة تركي" })];
  assert.deepEqual(
    filterProductsBySearch(products, "شاى").map((row) => row.id),
    ["P1"],
  );
  assert.deepEqual(
    filterProductsBySearch(products, "أخضر").map((row) => row.id),
    ["P1"],
  );
});

test("matches the category name and raw key", () => {
  const products = [product(), product({ id: "P2", name: "مياه", categoryKey: "water" })];
  const names = new Map([
    ["drinks", "مشروبات"],
    ["water", "مياه معدنية"],
  ]);
  assert.deepEqual(
    filterProductsBySearch(products, "مشروبات", names).map((row) => row.id),
    ["P1"],
  );
  assert.deepEqual(
    filterProductsBySearch(products, "water", names).map((row) => row.id),
    ["P2"],
  );
});

test("an empty query keeps every product", () => {
  const products = [product(), product({ id: "P2", name: "قهوة" })];
  assert.equal(filterProductsBySearch(products, "   ").length, 2);
});

test("filters image-less and pharmacy-review rows across lifecycle states", () => {
  const products = [
    product({ id: "P1", imageDataUrl: "https://cdn.example.com/1.jpg" }),
    product({ id: "P2", imageDataUrl: null }),
    product({
      id: "P3",
      imageDataUrl: "https://cdn.example.com/3.jpg",
      qaMetadata: { autopilot_needs_review: true },
    }),
  ];

  assert.deepEqual(
    filterProducts(products, "no_image").map((row) => row.id),
    ["P2"],
  );
  assert.deepEqual(
    filterProducts(products, "needs_review").map((row) => row.id),
    ["P3"],
  );
  assert.equal(filterProducts(products, "all").length, 3);

  const counts = catalogFilterCounts(products);
  assert.equal(counts.no_image, 1);
  assert.equal(counts.needs_review, 1);
  assert.equal(counts.completed, 3);
});
