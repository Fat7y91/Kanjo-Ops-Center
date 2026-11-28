import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const importer = loadTsModule(
  path.join(projectRoot, "src/lib/merchants/import.ts"),
);

/**
 * The merchant import carries commission rates straight from a spreadsheet, so
 * these tests pin the mapping and the guards: a known vendor type, a rate in
 * range, a valid city and no duplicate name inside the file.
 */

const roster = {
  vendorTypes: new Map([
    ["مطعم", { id: 1, name: "مطعم" }],
    ["cafe", { id: 2, name: "كافيه" }],
  ]),
  cities: new Map([["القاهرة", "city-1"]]),
  defaultCityId: "city-1",
};

function row(overrides = {}) {
  return {
    name: "مطعم النور",
    phone: "01012345678",
    vendor_type: "مطعم",
    commission_rate: "15%",
    address: "شارع 9",
    ...overrides,
  };
}

test("a valid row maps name, contact, vendor type and rate", () => {
  const plan = importer.planMerchantImport([row()], roster);
  assert.equal(plan.issues.length, 0);
  assert.equal(plan.candidates.length, 1);
  const candidate = plan.candidates[0];
  assert.equal(candidate.name, "مطعم النور");
  assert.equal(candidate.phone, "01012345678");
  assert.equal(candidate.vendorTypeId, 1);
  assert.equal(candidate.commissionRate, 15);
  assert.equal(candidate.cityId, "city-1");
});

test("the English vendor label resolves to the Arabic name", () => {
  const plan = importer.planMerchantImport(
    [row({ vendor_type: "Cafe" })],
    roster,
  );
  assert.equal(plan.candidates[0].vendorType, "كافيه");
});

test("an unknown vendor type is reported, not guessed", () => {
  const plan = importer.planMerchantImport(
    [row({ vendor_type: "صيدلية" })],
    roster,
  );
  assert.equal(plan.candidates.length, 0);
  assert.match(plan.issues[0].message, /نوع تاجر غير معروف/);
});

test("an out-of-range or missing commission is rejected", () => {
  for (const value of ["", "120", "-3", "abc"]) {
    const plan = importer.planMerchantImport(
      [row({ commission_rate: value })],
      roster,
    );
    assert.equal(plan.candidates.length, 0, `rate ${value}`);
    assert.match(plan.issues[0].message, /نسبة العمولة/);
  }
});

test("a missing city falls back to the default city", () => {
  const plan = importer.planMerchantImport([row({ city: "" })], roster);
  assert.equal(plan.candidates[0].cityId, "city-1");
});

test("a duplicate name inside the file is skipped after the first", () => {
  const plan = importer.planMerchantImport([row(), row()], roster);
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.duplicates.length, 1);
  assert.equal(plan.duplicates[0].line, 3);
});

test("a missing name is reported with its data line", () => {
  const plan = importer.planMerchantImport([row({ name: "" })], roster);
  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.issues[0].line, 2);
});
