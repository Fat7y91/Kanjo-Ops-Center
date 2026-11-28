import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const core = loadTsModule(path.join(projectRoot, "scripts/lib/ai-taxonomy-core.ts"));
const force = loadTsModule(path.join(projectRoot, "scripts/lib/ai-force-resolve.ts"));
const variants = loadTsModule(path.join(projectRoot, "scripts/lib/ai-force-variants.ts"));

const taxonomy = core.buildTaxonomy([
  {
    id: "c1",
    parent_id: null,
    vendor_type: "صيدلية",
    name_ar: "أدوية",
    name_en: "Medicine",
    level: 1,
  },
  {
    id: "c2",
    parent_id: null,
    vendor_type: "صيدلية",
    name_ar: "عناية",
    name_en: "Care",
    level: 1,
  },
]);

const product = (overrides = {}) => ({
  id: "p1",
  name: "فيتامين سي",
  description: null,
  vendor_type_id: 3,
  merchants: { vendor_type: "صيدلية", vendor_type_id: 3 },
  ...overrides,
});

test("forced category keeps a valid low-confidence model choice", () => {
  const rows = force.coerceForcedCategories(
    [{ id: "p1", taxonomy_category_id: "c1", confidence: 20 }],
    [product()],
    taxonomy,
  );
  assert.equal(rows[0].taxonomy_category_id, "c1");
  assert.equal(rows[0].source, "model");
});

test("forced category replaces an invalid id with a valid fallback", () => {
  const rows = force.coerceForcedCategories(
    [{ id: "p1", taxonomy_category_id: "missing", confidence: 90 }],
    [product()],
    taxonomy,
  );
  assert.ok(["c1", "c2"].includes(rows[0].taxonomy_category_id));
  assert.equal(rows[0].source, "fallback");
});

const merchant = { id: "m1", name: "Marassi", vendor_type: "" };

test("forced merchant always receives a valid type id", () => {
  const rows = force.coerceForcedMerchants(
    [{ id: "m1", vendor_type_id: 999, confidence: 90 }],
    [merchant],
  );
  assert.ok(rows[0].vendor_type_id >= 1 && rows[0].vendor_type_id <= 15);
  assert.equal(rows[0].source, "fallback");
});

const variantRow = (labels) => ({
  id: "v1",
  name: "شاورما",
  vendor_type_id: 1,
  attributes: labels.map((variantLabel) => ({ variantLabel, price_minor: 1000 })),
});

test("fallback variant mapping handles numbers and common labels", () => {
  assert.deepEqual(variants.fallbackVariantPair("500 جرام"), { variant_id: 6, option_id: 26 });
  assert.deepEqual(variants.fallbackVariantPair("100ملل"), { variant_id: 7, option_id: 38 });
  assert.deepEqual(variants.fallbackVariantPair("XL"), { variant_id: 1, option_id: 51 });
  assert.deepEqual(variants.fallbackVariantPair("نص كيلو"), { variant_id: 6, option_id: 26 });
});

test("forced variants map every label even when the model is invalid", () => {
  const row = variantRow(["كبير", "غامض"]);
  const [result] = variants.coerceForcedVariants(
    [{ id: "v1", attributes: [{ label: "كبير", variant_id: 1, option_id: 3, confidence: 10 }] }],
    [row],
  );
  assert.equal(result.mappings.length, 2);
  assert.equal(result.mappings[0].variant_id, 1);
  assert.equal(result.mappings[0].option_id, 3);
  assert.ok(result.mappings[1].variant_id >= 1);
  assert.ok(result.mappings[1].option_id >= 1);
  const applied = variants.forceApplyVariantMappings(row, result.mappings);
  assert.ok(applied.every((attribute) => attribute.variantId && attribute.optionIds.length === 1));
});
