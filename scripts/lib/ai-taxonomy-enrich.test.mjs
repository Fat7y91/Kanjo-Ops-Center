import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const merchants = loadTsModule(
  path.join(projectRoot, "scripts/lib/ai-taxonomy-merchants.ts"),
);
const variants = loadTsModule(
  path.join(projectRoot, "scripts/lib/ai-taxonomy-variants.ts"),
);

const merchantRows = [
  { id: "m1", name: "صيدلية النور", vendor_type: "💊 صيدليات وعناية" },
  { id: "m2", name: "Marassi", vendor_type: "" },
  { id: "m3", name: "Kitchen Store", vendor_type: "🍳 مستلزمات المطبخ" },
];

test("merchant local mapping resolves known legacy categories", () => {
  assert.equal(merchants.localMerchantType(merchantRows[0]), 3);
  assert.equal(merchants.localMerchantType(merchantRows[1]), null);
  assert.equal(merchants.localMerchantType(merchantRows[2]), null);
});

test("merchant coercion drops out-of-catalogue ids and low confidence", () => {
  const results = merchants.coerceMerchantClassifications(
    [
      { id: "m1", vendor_type_id: 3, confidence: 99 },
      { id: "m2", vendor_type_id: 99, confidence: 99 },
      { id: "m3", vendor_type_id: 13, confidence: 40 },
    ],
    merchantRows,
  );
  assert.deepEqual(
    results.map((row) => [row.id, row.vendor_type_id, row.needs_human_review]),
    [
      ["m1", 3, false],
      ["m2", null, true],
      ["m3", 13, true],
    ],
  );
});

const legacies = (overrides = {}) => ({
  id: "p1",
  name: "شاورما فراخ",
  vendor_type_id: 1,
  attributes: [{ variantLabel: "كبير", price_minor: 9000, image_url: "" }],
  ...overrides,
});

test("variant local mapping resolves unique option names and rejects ambiguity", () => {
  assert.deepEqual(variants.localVariantMapping("كبير"), { variant_id: 1, option_id: 3 });
  assert.deepEqual(variants.localVariantMapping("كيلو"), { variant_id: 6, option_id: 28 });
  assert.equal(variants.localVariantMapping("شرقي"), null);
  assert.equal(variants.localVariantMapping("XL"), null);
});

test("variant split keeps local rows and sends ambiguous labels to the model", () => {
  const local = legacies();
  const pending = legacies({
    id: "p2",
    attributes: [{ variantLabel: "XL", price_minor: 12000, image_url: "" }],
  });
  const result = variants.splitVariantProducts([local, pending]);
  assert.deepEqual(result.local.map((row) => row.id), ["p1"]);
  assert.deepEqual(result.pending.map((row) => row.id), ["p2"]);
});

test("variant coercion validates catalogue pairs and confidence", () => {
  const rows = [
    legacies(),
    legacies({
      id: "p2",
      attributes: [{ variantLabel: "XL", price_minor: 12000, image_url: "" }],
    }),
    legacies({
      id: "p3",
      attributes: [{ variantLabel: "غامض", price_minor: 1000, image_url: "" }],
    }),
  ];
  const results = variants.coerceVariantClassifications(
    [
      {
        id: "p1",
        attributes: [{ label: "كبير", variant_id: 1, option_id: 3, confidence: 98 }],
      },
      {
        id: "p2",
        attributes: [{ label: "XL", variant_id: 1, option_id: 51, confidence: 90 }],
      },
      {
        id: "p3",
        attributes: [{ label: "غامض", variant_id: 999, option_id: 999, confidence: 99 }],
      },
    ],
    rows,
  );
  assert.deepEqual(
    results.map((row) => [row.id, row.needs_human_review, row.mappings.length]),
    [
      ["p1", false, 1],
      ["p2", false, 1],
      ["p3", true, 0],
    ],
  );
});

test("applying variant mappings preserves price and image", () => {
  const row = legacies({
    attributes: [
      { variantLabel: "كبير", price_minor: 9000, image_url: "https://img" },
    ],
  });
  const mapped = variants.applyVariantMappings(row, [
    { label: "كبير", variant_id: 1, option_id: 3, confidence: 100 },
  ]);
  assert.deepEqual(mapped, [
    {
      variantLabel: "كبير",
      variantId: 1,
      optionIds: [3],
      price_minor: 9000,
      image_url: "https://img",
    },
  ]);
});
