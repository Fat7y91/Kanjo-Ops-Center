import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const mapping = loadTsModule(
  path.join(projectRoot, "src/lib/taxonomy/db-mapping.ts"),
);

test("only V1-synced categories enter the dashboard snapshot", () => {
  const categories = mapping.toTaxonomyCategories([
    {
      id: "v1-child",
      parent_id: "v1-root",
      vendor_type: "الحلو",
      vendor_type_id: 15,
      numeric_id: 226,
      name_ar: "تورتة",
      name_en: "Tart",
      level: 2,
      source: "v1",
    },
    {
      id: "v1-root",
      parent_id: null,
      vendor_type: "الحلو",
      vendor_type_id: 15,
      numeric_id: 1,
      name_ar: "حلى",
      name_en: "Desserts",
      level: 1,
      source: "v1",
    },
    {
      id: "seed-only",
      parent_id: null,
      vendor_type: "الحلو",
      vendor_type_id: null,
      numeric_id: null,
      name_ar: "بذرة قديمة",
      name_en: "Legacy seed",
      level: 1,
      source: "seed",
    },
  ]);

  assert.equal(categories.length, 2);
  assert.equal(categories[0].id, 1);
  assert.equal(categories[1].id, 226);
  assert.equal(categories[1].vendorTypeId, 15);
  assert.equal(categories[1].parentId, 1);
  assert.equal(categories[1].name_ar, "تورتة");
});

test("vendor rows preserve dashboard ids and timestamps", () => {
  const vendor = mapping.toTaxonomyVendorType({
    id: 15,
    name_ar: "الحلو",
    name_en: "Desserts",
    created_at: "2026-12-14T00:00:00.000Z",
    updated_at: "2026-12-14T01:00:00.000Z",
  });

  assert.equal(vendor.id, 15);
  assert.equal(vendor.name_ar, "الحلو");
  assert.equal(vendor.name_en, "Desserts");
  assert.equal(vendor.updatedAt, "2026-12-14T01:00:00.000Z");
  assert.equal(vendor.active, true);
});
