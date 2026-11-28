import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const core = loadTsModule(
  path.join(projectRoot, "scripts/lib/ai-taxonomy-core.ts"),
);

const {
  CONFIDENCE_THRESHOLD,
  normalizeLabel,
  parentPath,
  buildTaxonomy,
  vendorCandidates,
  candidateCategories,
  coerceClassifications,
  extractJsonArray,
  allowedCategoryIds,
} = core;

const nodes = [
  {
    id: "vt1",
    parent_id: null,
    vendor_type: "مطاعم وكافيهات",
    name_ar: "مطاعم",
    name_en: "Restaurants",
    level: 0,
  },
  {
    id: "cat1",
    parent_id: "vt1",
    vendor_type: "مطاعم وكافيهات",
    name_ar: "بيتزا",
    name_en: "Pizza",
    level: 1,
  },
  {
    id: "cat2",
    parent_id: "cat1",
    vendor_type: "مطاعم وكافيهات",
    name_ar: "بيتزا مارجريتا",
    name_en: "Margherita",
    level: 2,
  },
  {
    id: "vt2",
    parent_id: null,
    vendor_type: "صيدلية",
    name_ar: "صيدلية",
    name_en: "Pharmacy",
    level: 0,
  },
  {
    id: "cat3",
    parent_id: "vt2",
    vendor_type: "صيدلية",
    name_ar: "أدوية",
    name_en: "Medicine",
    level: 1,
  },
];

const taxonomy = buildTaxonomy(nodes);

const product = (overrides = {}) => ({
  id: "p1",
  name: "بيتزا مارجريتا",
  description: null,
  vendor_type_id: 1,
  merchants: { vendor_type: "🍔 مطاعم وكافيهات", vendor_type_id: 1 },
  ...overrides,
});

test("normalizeLabel strips emoji and punctuation so labels compare", () => {
  assert.equal(normalizeLabel("🍔 مطاعم وكافيهات"), normalizeLabel("مطاعم وكافيهات"));
  assert.equal(normalizeLabel("  Café & Juice "), "café juice");
  assert.equal(normalizeLabel(null), "");
});

test("parentPath walks the tree from root to the node", () => {
  assert.equal(parentPath(nodes[2], taxonomy.byId), "مطاعم > بيتزا > بيتزا مارجريتا");
  assert.equal(parentPath(nodes[0], taxonomy.byId), "مطاعم");
});

test("buildTaxonomy groups nodes by normalised vendor type", () => {
  assert.equal(taxonomy.nodes.length, 5);
  assert.equal(taxonomy.byVendorType.get(normalizeLabel("صيدلية")).length, 2);
});

test("vendorCandidates includes the merchant label and the seed label", () => {
  const labels = vendorCandidates(product());
  assert.ok(labels.some((l) => l.includes("مطاعم")));
  assert.ok(labels.some((l) => /Restaurant/i.test(l)));
});

test("candidateCategories is scoped to the product vendor type", () => {
  const ids = candidateCategories(product(), taxonomy).map((n) => n.id);
  assert.deepEqual(ids.sort(), ["cat1", "cat2", "vt1"]);
  assert.ok(!ids.includes("cat3"), "pharmacy category must not leak into a restaurant batch");
});

test("candidateCategories falls back to the whole tree when vendor type is unknown", () => {
  const ids = candidateCategories(
    product({ vendor_type_id: null, merchants: { vendor_type: "", vendor_type_id: null } }),
    taxonomy,
  ).map((n) => n.id);
  assert.equal(ids.length, taxonomy.nodes.length);
});

test("coerceClassifications accepts a confident in-scope mapping", () => {
  const [result] = coerceClassifications(
    [{ id: "p1", taxonomy_category_id: "cat2", confidence: 92 }],
    [product()],
    new Set(["cat1", "cat2"]),
  );
  assert.equal(result.taxonomy_category_id, "cat2");
  assert.equal(result.confidence, 92);
  assert.equal(result.needs_human_review, false);
});

test("confidence below the threshold is flagged for human review", () => {
  const [result] = coerceClassifications(
    [{ id: "p1", taxonomy_category_id: "cat1", confidence: CONFIDENCE_THRESHOLD - 1 }],
    [product()],
    new Set(["cat1"]),
  );
  assert.equal(result.needs_human_review, true);
  assert.equal(result.taxonomy_category_id, "cat1");
});

test("the threshold itself is trusted", () => {
  const [result] = coerceClassifications(
    [{ id: "p1", taxonomy_category_id: "cat1", confidence: CONFIDENCE_THRESHOLD }],
    [product()],
    new Set(["cat1"]),
  );
  assert.equal(result.needs_human_review, false);
});

test("hallucinated category ids are rejected and flagged", () => {
  const [result] = coerceClassifications(
    [{ id: "p1", taxonomy_category_id: "not-a-real-id", confidence: 99 }],
    [product()],
    new Set(["cat1"]),
  );
  assert.equal(result.taxonomy_category_id, null);
  assert.equal(result.needs_human_review, true);
});

test("out-of-scope category ids are rejected even when they exist", () => {
  const [result] = coerceClassifications(
    [{ id: "p1", taxonomy_category_id: "cat3", confidence: 99 }],
    [product()],
    new Set(["cat1", "cat2"]),
  );
  assert.equal(result.taxonomy_category_id, null);
  assert.equal(result.needs_human_review, true);
});

test("confidence is clamped to 0-100 and tolerates junk", () => {
  const [high] = coerceClassifications(
    [{ id: "p1", taxonomy_category_id: "cat1", confidence: 300 }],
    [product()],
    new Set(["cat1"]),
  );
  assert.equal(high.confidence, 100);

  const [junk] = coerceClassifications(
    [{ id: "p1", taxonomy_category_id: "cat1", confidence: "nope" }],
    [product()],
    new Set(["cat1"]),
  );
  assert.equal(junk.confidence, 0);
  assert.equal(junk.needs_human_review, true);
});

test("a product the model drops still gets a review row", () => {
  const results = coerceClassifications(
    [],
    [product({ id: "p1" }), product({ id: "p2" })],
    new Set(["cat1"]),
  );
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.taxonomy_category_id === null));
  assert.ok(results.every((r) => r.needs_human_review === true));
});

test("duplicate and unknown ids in the reply are ignored", () => {
  const results = coerceClassifications(
    [
      { id: "p1", taxonomy_category_id: "cat1", confidence: 90 },
      { id: "p1", taxonomy_category_id: "cat2", confidence: 90 },
      { id: "ghost", taxonomy_category_id: "cat1", confidence: 90 },
    ],
    [product({ id: "p1" })],
    new Set(["cat1", "cat2"]),
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].taxonomy_category_id, "cat1");
});

test("extractJsonArray tolerates fences and surrounding prose", () => {
  assert.deepEqual(
    extractJsonArray('```json\n[{"id":"p1"}]\n```'),
    [{ id: "p1" }],
  );
  assert.deepEqual(
    extractJsonArray('Here you go:\n[{"id":"p1"}]\nDone.'),
    [{ id: "p1" }],
  );
});

test("extractJsonArray rejects a non-array payload", () => {
  assert.throws(() => extractJsonArray('{"id":"p1"}'));
});

test("merchantId is never used as a category id by accident", () => {
  const [result] = coerceClassifications(
    [{ id: "p1", taxonomy_category_id: "KJ-9EXVP8", confidence: 100 }],
    [product()],
    new Set(["cat1"]),
  );
  assert.equal(result.taxonomy_category_id, null);
});

test("per-product scope rejects a cross-vertical mapping in a mixed batch", () => {
  const restaurant = product({ id: "p1" });
  const pharmacy = product({
    id: "p2",
    name: "باراسيتامول",
    vendor_type_id: 3,
    merchants: { vendor_type: "صيدلية", vendor_type_id: 3 },
  });

  // The model maps the restaurant product into the pharmacy category.
  const results = coerceClassifications(
    [{ id: "p1", taxonomy_category_id: "cat3", confidence: 99 }],
    [restaurant, pharmacy],
    (p) => allowedCategoryIds(p, taxonomy),
  );

  const p1 = results.find((r) => r.id === "p1");
  assert.equal(p1.taxonomy_category_id, null, "restaurant must not take a pharmacy category");
  assert.equal(p1.needs_human_review, true);
});

test("allowedCategoryIds is scoped per vendor type", () => {
  const restaurantIds = allowedCategoryIds(product(), taxonomy);
  assert.ok(restaurantIds.has("cat1"));
  assert.ok(!restaurantIds.has("cat3"));
});
