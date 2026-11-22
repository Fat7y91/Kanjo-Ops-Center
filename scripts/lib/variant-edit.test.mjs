import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const variantEdit = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/variant-edit.ts"),
);

/**
 * Converting a simple product to a variable one replaces the whole variant set
 * in a single PATCH, so every selected option, price and code must survive the
 * round trip and an invalid row must fail before any write.
 */

test("variable conversion keeps each option, price and code", () => {
  const result = variantEdit.normalizeVariantDrafts([
    {
      variantId: 4,
      optionIds: [41, 42],
      label: "كبير — حار",
      price: 12.5,
      sku: " kj-03-a1b2 ",
      barcode: "1234567890123",
      available: false,
      imageUrl: "https://cdn.example/variant.png",
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.basePrice, 12.5);
  assert.deepEqual(result.attributes, [
    {
      variantId: 4,
      optionIds: [41, 42],
      variantLabel: "كبير — حار",
      price_minor: 1250,
      sku: "KJ-03-A1B2",
      barcode: "1234567890123",
      available: false,
      image_url: "https://cdn.example/variant.png",
    },
  ]);
});

test("empty variant sets are rejected", () => {
  const result = variantEdit.normalizeVariantDrafts([]);
  assert.equal(result.ok, false);
  assert.match(result.message, /متغير/);
});

test("a row without a selected option is rejected", () => {
  const result = variantEdit.normalizeVariantDrafts([
    {
      variantId: 4,
      optionIds: [],
      label: "بدون خيار",
      price: 10,
      sku: "",
      barcode: "",
      available: true,
    },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.message, /خيار/);
});

test("a negative or empty price is rejected before any write", () => {
  const negative = variantEdit.normalizeVariantDrafts([
    {
      variantId: 4,
      optionIds: [41],
      label: "كبير",
      price: -1,
      sku: "",
      barcode: "",
      available: true,
    },
  ]);
  assert.equal(negative.ok, false);

  const missing = variantEdit.normalizeVariantDrafts([
    {
      variantId: 4,
      optionIds: [41],
      label: "كبير",
      price: Number.NaN,
      sku: "",
      barcode: "",
      available: true,
    },
  ]);
  assert.equal(missing.ok, false);
});

test("blank variant codes are stored as null", () => {
  const result = variantEdit.normalizeVariantDrafts([
    {
      variantId: null,
      optionIds: [7],
      label: "صغير",
      price: 3,
      sku: "   ",
      barcode: "",
      available: true,
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.attributes[0].sku, null);
  assert.equal(result.attributes[0].barcode, null);
});

test("legacy variant images survive the edit round trip", () => {
  const rows = variantEdit.editableRowsFromProduct(
    {
      id: "prod-1",
      price: 98,
      sku: "KJ-03-PARENT",
      barcode: "",
      attributes: [
        {
          variantId: 8,
          optionIds: [43],
          variantLabel: "قطعه 30",
          price_minor: 98000,
          image_url: "https://cdn.example/legacy.png",
        },
      ],
    },
    [
      {
        variant_id: 8,
        name_ar: "الحجم",
        options: [{ option_id: 43, option_name_ar: "30" }],
      },
    ],
  );

  assert.equal(rows[0].imageUrl, "https://cdn.example/legacy.png");
  assert.equal(rows[0].sku, "");
  assert.equal(rows[0].barcode, "");
  assert.equal(rows[0].label, "قطعه 30");
  assert.equal(rows[0].price, "980.00");
});
