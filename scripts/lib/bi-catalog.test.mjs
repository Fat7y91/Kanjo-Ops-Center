import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { buildCatalog } = loadTsModule(
  path.join(projectRoot, "src/lib/bi/select.ts"),
);

function row(overrides = {}) {
  return {
    id: "P1",
    name: "Product",
    merchantId: "M1",
    merchantName: "Merchant",
    cityId: "city-desouk",
    cityName: "دسوق",
    team: "Fox Team",
    state: "missing",
    appPublished: false,
    price: 0,
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

test("counts a merchant as live only when published on the app with products", () => {
  const catalog = buildCatalog([
    row({ id: "P1", merchantId: "M1", appPublished: true }),
    row({ id: "P2", merchantId: "M1", appPublished: true }),
    row({ id: "P3", merchantId: "M2" }),
    row({ id: "catalog-missing-M3", merchantId: "M3", appPublished: true }),
  ]);

  assert.equal(catalog.liveMerchants, 1);
  assert.equal(catalog.merchantTotal, 3);
  assert.equal(catalog.merchantReadiness, 1 / 3);
  assert.equal(catalog.total, 4);
  assert.equal(catalog.readiness, 0);
});

test("product counters still describe product rows", () => {
  const catalog = buildCatalog([
    row({ id: "P1", state: "published" }),
    row({ id: "P2", state: "missing" }),
  ]);

  assert.deepEqual(catalog.published, 1);
  assert.deepEqual(catalog.missing, 1);
  assert.equal(catalog.readiness, 0.5);
});
