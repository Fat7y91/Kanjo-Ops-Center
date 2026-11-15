import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const md5 = loadTsModule(
  path.join(projectRoot, "src/lib/taxonomy/csv-sync/md5.ts"),
);
const parse = loadTsModule(
  path.join(projectRoot, "src/lib/taxonomy/csv-sync/parse.ts"),
);
const plan = loadTsModule(
  path.join(projectRoot, "src/lib/taxonomy/csv-sync/plan.ts"),
);

const nodeMd5 = (value) => createHash("md5").update(value).digest("hex");

test("md5 matches node:crypto across lengths and unicode", () => {
  const samples = ["", "a", "abc", "kanjo-taxonomy-v1:5:175", "مطعم", "x".repeat(129)];
  for (const sample of samples) {
    assert.equal(md5.md5Hex(sample), nodeMd5(sample), sample);
  }
});

test("taxonomyUuid reproduces the seed migration ids", () => {
  // 632e5fec-... is أم علي under vendor type 5 in the shipped seed.
  assert.equal(
    parse.taxonomyUuid(5, 175),
    "632e5fec-5988-bdce-420f-188bfc1da538",
  );
});

test("shared numeric ids across vendor scopes stay distinct", () => {
  const a = parse.taxonomyUuid(1, 186);
  const b = parse.taxonomyUuid(3, 186);
  assert.notEqual(a, b);
});

test("parseCategories normalises headers and drops invalid rows", () => {
  const result = parse.parseCategories([
    { id: "10", vendor_type: "5", name_ar: "أم علي", name_en: "Om Ali" },
    { categoryId: "11", vendorTypeId: "5", nameAr: "كيك", nameEn: "" },
    { id: "0", vendor_type: "5", name_ar: "سيئ" },
    { id: "12", name_ar: "بلا نوع" },
  ]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].nameAr, "كيك");
  assert.equal(result.issues.length, 2);
  assert.match(result.issues[0].message, /معرّف التصنيف/);
});

test("parseVendorTypes accepts numeric ids sent as JSON numbers", () => {
  const result = parse.parseVendorTypes([
    { id: 1, name_ar: "مطاعم" },
    { id: "2", name_ar: "كافيهات" },
  ]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].numericId, 1);
  assert.equal(result.rows[1].numericId, 2);
  assert.equal(result.issues.length, 0);
});

test("buildCategoryPlan derives levels from the parent chain", () => {
  const parsed = parse.parseCategories([
    { id: "1", vendor_type: "5", parent_id: "", name_ar: "جذر" },
    { id: "2", vendor_type: "5", parent_id: "1", name_ar: "ابن" },
    { id: "3", vendor_type: "5", parent_id: "2", name_ar: "حفيد" },
  ]);
  const result = plan.buildCategoryPlan(parsed, new Map([[5, "الحلو"]]));
  const byName = new Map(result.rows.map((row) => [row.name_ar, row]));
  assert.equal(byName.get("جذر").level, 1);
  assert.equal(byName.get("ابن").level, 2);
  assert.equal(byName.get("حفيد").level, 3);
  assert.equal(byName.get("ابن").parent_id, byName.get("جذر").id);
  assert.equal(byName.get("جذر").vendor_type, "الحلو");
});

test("buildCategoryPlan folds vendor scope into ids and dedupes", () => {
  const parsed = parse.parseCategories([
    { id: "186", vendor_type: "1", name_ar: "أ" },
    { id: "186", vendor_type: "3", name_ar: "ب" },
    { id: "186", vendor_type: "1", name_ar: "أ محدث" },
  ]);
  const result = plan.buildCategoryPlan(parsed, new Map());
  assert.equal(result.rows.length, 2);
  assert.equal(result.duplicates, 1);
  const names = result.rows.map((row) => row.name_ar).sort();
  assert.deepEqual(names, ["أ محدث", "ب"]);
});

test("buildCategoryPlan degrades unknown parents to level 1", () => {
  const parsed = parse.parseCategories([
    { id: "50", vendor_type: "2", parent_id: "999", name_ar: "يتيم" },
  ]);
  const result = plan.buildCategoryPlan(parsed, new Map([[2, "قهوة"]]));
  assert.equal(result.rows[0].level, 1);
  assert.equal(result.rows[0].parent_id, null);
  assert.equal(result.unresolvedParents, 1);
});

test("buildCategoryPlan keeps empty name_en as an empty string", () => {
  const parsed = parse.parseCategories([
    { id: "7", vendor_type: "5", name_ar: "بلا إنجليزي" },
  ]);
  const result = plan.buildCategoryPlan(parsed, new Map());
  assert.equal(result.rows[0].name_en, "");
});

test("parseVariantAttributes keeps standalone variant rows", () => {
  const result = parse.parseVariantAttributes([
    { variant_id: "1", variant_name_ar: "الحجم", option_id: "1", option_name_ar: "صغير" },
    { variantId: "1", group_name_ar: "الحجم", optionId: "2", name_ar: "وسط" },
    { variant_id: "1", option_id: "0", name_ar: "سيئ" },
  ]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].variantId, 1);
  assert.equal(result.rows[1].optionNameAr, "وسط");
  assert.equal(result.issues.length, 1);
});

test("buildVariantPlan needs no vendor or category rows", () => {
  const parsed = parse.parseVariantAttributes([
    { variant_id: "1", variant_name_ar: "الحجم", option_id: "1", option_name_ar: "صغير", option_name_en: "Small" },
    { variant_id: "1", variant_name_ar: "الحجم", option_id: "2", option_name_ar: "وسط" },
    { variant_id: "2", variant_name_ar: "الطعم", option_id: "7", option_name_ar: "عادي" },
  ]);
  const result = plan.buildVariantPlan(parsed, new Map(), "2026-11-28T00:00:00.000Z");
  assert.equal(result.attributes.length, 2);
  assert.equal(result.options.length, 3);
  assert.equal(result.unresolvedGroups, 0);
  assert.equal(result.attributes[0].name_en, "");
  assert.equal(result.options[0].variant_id, 1);
  assert.equal(result.options[0].updated_at, "2026-11-28T00:00:00.000Z");
});

test("buildVariantPlan falls back to seed names and dedupes option ids", () => {
  const parsed = parse.parseVariantAttributes([
    { variant_id: "1", option_id: "1", option_name_ar: "صغير" },
    { variant_id: "1", variant_name_ar: "الحجم", option_id: "1", option_name_ar: "صغير محدث" },
  ]);
  const result = plan.buildVariantPlan(
    parsed,
    new Map([[1, { nameAr: "الحجم", nameEn: "Size" }]]),
    "2026-11-28T00:00:00.000Z",
  );
  assert.equal(result.attributes[0].name_ar, "الحجم");
  assert.equal(result.attributes[0].name_en, "Size");
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].name_ar, "صغير محدث");
  assert.equal(result.duplicates, 1);
});

test("buildVariantPlan skips options whose group has no name", () => {
  const parsed = parse.parseVariantAttributes([
    { variant_id: "99", option_id: "1", option_name_ar: "بلا مجموعة" },
  ]);
  const result = plan.buildVariantPlan(parsed, new Map(), "2026-11-28T00:00:00.000Z");
  assert.equal(result.attributes.length, 0);
  assert.equal(result.options.length, 0);
  assert.equal(result.unresolvedGroups, 1);
});
