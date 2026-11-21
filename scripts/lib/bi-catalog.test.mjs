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
  const catalog = buildCatalog(
    [
      row({ id: "P1", merchantId: "M1", appPublished: true }),
      row({ id: "P2", merchantId: "M1", appPublished: true }),
      row({ id: "P3", merchantId: "M2" }),
      row({ id: "catalog-missing-M3", merchantId: "M3", appPublished: true }),
    ],
    10,
  );

  assert.equal(catalog.liveMerchants, 1);
  assert.equal(catalog.signedTotal, 10);
  assert.equal(catalog.signedReadiness, 1 / 10);
  assert.equal(catalog.total, 4);
  assert.equal(catalog.readiness, 0);
});

test("readiness divides live merchants by signed contracts, not all merchants", () => {
  const catalog = buildCatalog(
    [
      row({ id: "P1", merchantId: "M1", appPublished: true }),
      row({ id: "P2", merchantId: "M2" }),
      row({ id: "P3", merchantId: "M3" }),
      row({ id: "P4", merchantId: "M4" }),
    ],
    2,
  );

  assert.equal(catalog.liveMerchants, 1);
  assert.equal(catalog.signedTotal, 2);
  assert.equal(catalog.signedReadiness, 0.5);
});

test("does not divide by zero when no contract is signed", () => {
  const catalog = buildCatalog([row({ appPublished: true })], 0);

  assert.equal(catalog.signedTotal, 0);
  assert.equal(catalog.signedReadiness, 0);
});

test("product counters still describe product rows", () => {
  const catalog = buildCatalog(
    [
      row({ id: "P1", state: "published" }),
      row({ id: "P2", state: "missing" }),
    ],
    1,
  );

  assert.deepEqual(catalog.published, 1);
  assert.deepEqual(catalog.missing, 1);
  assert.equal(catalog.readiness, 0.5);
});
