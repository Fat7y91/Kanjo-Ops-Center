import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const importer = loadTsModule(
  path.join(projectRoot, "src/lib/operations/orders-import.ts"),
);

/**
 * The bulk import is the one path where a spreadsheet can move money in bulk.
 * These tests pin the row-level rules: recognised parties, positive totals, a
 * known payment method and a real date, with a precise skip reason otherwise.
 */

const roster = {
  merchants: new Map([
    ["مطعم النور", "m-1"],
    ["كافيه روما", "m-2"],
  ]),
  couriers: new Map([
    ["أحمد سيد", "c-1"],
    ["محمد علي", "c-2"],
  ]),
};

function row(overrides = {}) {
  return {
    order_id: "ORD-1",
    vendor: "مطعم النور",
    delivery_partner: "أحمد سيد",
    payment_method: "COD",
    total: "250",
    courier_fee: "25",
    date: "2026-11-11",
    ...overrides,
  };
}

test("a valid row maps to a candidate with the roster ids", () => {
  const plan = importer.planImport([row()], roster);
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.issues.length, 0);
  const candidate = plan.candidates[0];
  assert.equal(candidate.merchantId, "m-1");
  assert.equal(candidate.courierId, "c-1");
  assert.equal(candidate.paymentMethod, "COD");
  assert.equal(candidate.orderValue, 250);
  assert.equal(candidate.deliveryFee, 25);
  assert.equal(candidate.occurredAt, "2026-11-11");
});

test("an unknown vendor is reported, not guessed", () => {
  const plan = importer.planImport([row({ vendor: "غير موجود" })], roster);
  assert.equal(plan.candidates.length, 0);
  assert.match(plan.issues[0].message, /تاجر غير معروف/);
});

test("an unknown courier is reported", () => {
  const plan = importer.planImport(
    [row({ delivery_partner: "مجهول" })],
    roster,
  );
  assert.equal(plan.candidates.length, 0);
  assert.match(plan.issues[0].message, /مندوب توصيل غير معروف/);
});

test("an unknown courier is collected when the operator opted to create it", () => {
  const plan = importer.planImport(
    [row({ delivery_partner: "مجهول" })],
    roster,
    { createMissingCouriers: true },
  );
  assert.equal(plan.issues.length, 0);
  assert.deepEqual(plan.missingCouriers, ["مجهول"]);
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].courierId, "");
});

test("a known courier is never reported as missing", () => {
  const plan = importer.planImport([row()], roster, {
    createMissingCouriers: true,
  });
  assert.deepEqual(plan.missingCouriers, []);
});

test("an unknown payment method is rejected", () => {
  const plan = importer.planImport(
    [row({ payment_method: "bitcoin" })],
    roster,
  );
  assert.equal(plan.candidates.length, 0);
  assert.match(plan.issues[0].message, /طريقة الدفع/);
});

test("Arabic and English payment labels both resolve", () => {
  assert.equal(importer.parsePaymentMethod("الدفع عند الاستلام"), "COD");
  assert.equal(importer.parsePaymentMethod("online"), "ONLINE");
  assert.equal(importer.parsePaymentMethod("بطاقة"), "ONLINE");
});

test("a missing total is rejected rather than posted as zero", () => {
  const plan = importer.planImport([row({ total: "" })], roster);
  assert.equal(plan.candidates.length, 0);
  assert.match(plan.issues[0].message, /إجمالي الطلب/);
});

test("amounts tolerate Arabic digits and separators", () => {
  const plan = importer.planImport(
    [row({ total: "١٬٢٥٠", courier_fee: "٢٥" })],
    roster,
  );
  assert.equal(plan.candidates[0].orderValue, 1250);
  assert.equal(plan.candidates[0].deliveryFee, 25);
});

test("a duplicate order id keeps the first occurrence", () => {
  const plan = importer.planImport(
    [row(), row({ total: "999" })],
    roster,
  );
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.duplicates.length, 1);
});

test("a missing date is reported, not stamped with import time", () => {
  const plan = importer.planImport([row({ date: "" })], roster);
  assert.equal(plan.candidates.length, 0);
  assert.match(plan.issues[0].message, /تاريخ الطلب/);
});

test("alternate headers from the PO export are accepted", () => {
  const plan = importer.planImport(
    [
      {
        orderNumber: "ORD-9",
        merchant_name: "كافيه روما",
        courierName: "محمد علي",
        paymentMethod: "ONLINE",
        orderValue: "1200",
        delivery_fee: "30",
        occurred_at: "11/11/2026",
      },
    ],
    roster,
  );
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].paymentMethod, "ONLINE");
  assert.equal(plan.candidates[0].occurredAt, "2026-11-11");
});

test("the data line number accounts for the header row", () => {
  const plan = importer.planImport(
    [row(), row({ order_id: "ORD-2", vendor: "x" })],
    roster,
  );
  assert.equal(plan.issues[0].line, 3);
});
