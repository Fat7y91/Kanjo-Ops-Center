import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const {
  DIRECTORY_FILTERS,
  directoryFilterCounts,
  matchesDirectoryFilter,
} = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/directory-filters.ts"),
);

function card(overrides = {}) {
  return {
    id: "M1",
    name: "Merchant",
    cityName: "دسوق",
    vendorType: "مطاعم",
    contractState: "final_contract",
    logoUrl: null,
    coverUrl: null,
    vipMenu: false,
    appPublished: false,
    productCount: 2,
    publishedCount: 0,
    pendingCount: 0,
    deleteRequestCount: 0,
    coverImage: null,
    live: false,
    ...overrides,
  };
}

test("filter order preserves the legacy workflow tabs", () => {
  assert.deepEqual(DIRECTORY_FILTERS, [
    "all",
    "complete",
    "processing",
    "empty",
    "under_contract",
    "delete_requests",
  ]);
});

test("complete requires products and no pending review", () => {
  assert.equal(matchesDirectoryFilter(card(), "complete"), true);
  assert.equal(matchesDirectoryFilter(card({ productCount: 0 }), "complete"), false);
  assert.equal(matchesDirectoryFilter(card({ pendingCount: 1 }), "complete"), false);
});

test("processing matches merchants with pending products", () => {
  assert.equal(matchesDirectoryFilter(card({ pendingCount: 1 }), "processing"), true);
  assert.equal(matchesDirectoryFilter(card(), "processing"), false);
});

test("under contract maps to the provisional state", () => {
  assert.equal(
    matchesDirectoryFilter(card({ contractState: "provisional" }), "under_contract"),
    true,
  );
  assert.equal(matchesDirectoryFilter(card(), "under_contract"), false);
});

test("delete requests and empty slices use their tallies", () => {
  assert.equal(
    matchesDirectoryFilter(card({ deleteRequestCount: 1 }), "delete_requests"),
    true,
  );
  assert.equal(
    matchesDirectoryFilter(card({ productCount: 0, pendingCount: 0 }), "empty"),
    true,
  );
});

test("counts include overlapping workflow slices", () => {
  const counts = directoryFilterCounts([
    card(),
    card({ id: "M2", productCount: 0, pendingCount: 0 }),
    card({ id: "M3", pendingCount: 2, contractState: "provisional" }),
    card({ id: "M4", deleteRequestCount: 1 }),
  ]);

  assert.deepEqual(counts, {
    all: 4,
    complete: 2,
    processing: 1,
    empty: 1,
    under_contract: 1,
    delete_requests: 1,
  });
});
