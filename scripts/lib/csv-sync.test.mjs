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
