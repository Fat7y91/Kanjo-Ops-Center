import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const {
  masterCatalogScore,
  masterCatalogTokens,
  prepareMasterCatalogItem,
  searchMasterCatalog,
} = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/master-catalog-search.ts"),
);

function item(overrides = {}) {
  return {
    id: "Kj-0001",
    name: "قهوة تركي",
    categoryLabel: "المشروبات",
    categoryKey: "4-34",
    price: 93.99,
    imageUrl: "",
    driveFileId: "drive-1",
    ...overrides,
  };
}

function search(items, query) {
  return searchMasterCatalog(items.map(prepareMasterCatalogItem), query);
}

test("expands Egyptian synonyms before matching", () => {
  const items = [
    item(),
    item({ id: "Kj-0002", name: "حليب مزارع دينا" }),
    item({ id: "Kj-0003", name: "شاهي ليبتون" }),
    item({ id: "Kj-0004", name: "زبادى المراعي" }),
  ];

  assert.deepEqual(
    search(items, "كوفي").map((row) => row.id),
    ["Kj-0001"],
  );
  assert.deepEqual(
    search(items, "لبن").map((row) => row.id),
    ["Kj-0002"],
  );
  assert.deepEqual(
    search(items, "شاي").map((row) => row.id),
    ["Kj-0003"],
  );
  assert.deepEqual(
    search(items, "yogurt").map((row) => row.id),
    ["Kj-0004"],
  );
});

test("normalises Arabic spelling variants and hamza forms", () => {
  const items = [item({ name: "أحمد تي شاي بالخوخ" })];
  assert.deepEqual(
    search(items, "احمد").map((row) => row.id),
    ["Kj-0001"],
  );
  assert.deepEqual(
    search(items, "شاى").map((row) => row.id),
    ["Kj-0001"],
  );
});

test("typed spelling outranks a synonym prefix collision", () => {
  const items = [
    item({ id: "Kj-0009", name: "شاهين بن سادة غامق" }),
    item({ id: "Kj-0010", name: "شاي ليبتون - 100 جم" }),
  ];
  assert.deepEqual(
    search(items, "شاي").map((row) => row.id),
    ["Kj-0010", "Kj-0009"],
  );
});

test("OR token overlap keeps noisy or partial names as candidates", () => {
  const items = [item({ name: "قهوة تركي سادة" })];
  assert.deepEqual(
    search(items, "قهوة تركي").map((row) => row.id),
    ["Kj-0001"],
  );
  assert.deepEqual(
    search(items, "قهوة حليب").map((row) => row.id),
    ["Kj-0001"],
  );
});

test("category-only matches are returned but rank below name hits", () => {
  const items = [
    item({ id: "Kj-0001", name: "قهوة تركي", categoryLabel: "المشروبات" }),
    item({ id: "Kj-0002", name: "مياه معدنية", categoryLabel: "المشروبات" }),
  ];
  const ranked = search(items, "مشروبات");
  assert.equal(ranked.length, 2);
  assert.deepEqual(
    ranked.map((row) => row.id).sort(),
    ["Kj-0001", "Kj-0002"],
  );
  const nameFirst = searchMasterCatalog(
    items.map(prepareMasterCatalogItem),
    "قهوة",
  );
  assert.equal(nameFirst[0].id, "Kj-0001");
});

test("scores prefix and infix matches deterministically", () => {
  const prepared = prepareMasterCatalogItem(item({ name: "قهوة تركي سادة" }));
  const tokens = masterCatalogTokens("قهوة");
  assert.ok(masterCatalogScore(prepared, tokens) > 0);
  assert.deepEqual(masterCatalogTokens("  "), []);
  assert.deepEqual(
    search([item()], "قهوة").map((row) => ({
      price: row.price,
      categoryKey: row.categoryKey,
      driveFileId: row.driveFileId,
    })),
    [{ price: 93.99, categoryKey: "4-34", driveFileId: "drive-1" }],
  );
});

test("limits results and drops empty queries", () => {
  const items = Array.from({ length: 25 }, (_, index) =>
    item({ id: `Kj-${index}`, name: `قهوة ${index}` }),
  );
  assert.equal(search(items, "قهوة").length, 20);
  assert.equal(search(items, "قهوة").length, 20);
  assert.deepEqual(search(items, "   "), []);
});
