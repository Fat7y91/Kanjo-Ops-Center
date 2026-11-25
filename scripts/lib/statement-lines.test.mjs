import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const lines = loadTsModule(
  path.join(projectRoot, "src/lib/operations/statement-lines.ts"),
);

function journalRow(overrides = {}) {
  return {
    id: "row-1",
    entryId: "entry-1",
    date: "2026-11-19",
    reference: "عملية 149257",
    memo: "عمولة مستحقة على التاجر",
    debitMinor: 2250,
    creditMinor: 0,
    sourceType: "operation",
    sourceId: "op-1",
    ...overrides,
  };
}

function operationFact(overrides = {}) {
  return {
    orderNumber: "149257",
    occurredAt: "2026-11-19T18:15:00Z",
    orderValueMinor: 15000,
    commissionPercent: 15,
    courierId: "courier-1",
    courierName: null,
    ...overrides,
  };
}

function build(args = {}) {
  return lines.buildPartyStatementLines({
    rows: [journalRow()],
    facts: new Map([["op-1", operationFact()]]),
    courierNames: new Map([["courier-1", "يوسف علي"]]),
    partyType: "merchant",
    openingMinor: 1000,
    ...args,
  });
}

test("merchant orders resolve the courier and keep the running balance", () => {
  const [line] = build();

  assert.equal(line.courierName, "يوسف علي");
  assert.equal(line.orderNumber, "149257");
  assert.equal(line.orderValue, 150);
  assert.equal(line.commissionPercent, 15);
  assert.deepEqual(
    [line.debit, line.credit, line.running],
    [22.5, 0, 32.5],
  );
});

test("a roster miss falls back to the name snapshotted on the fact", () => {
  const [line] = build({
    courierNames: new Map([["courier-1", "   "]]),
    facts: new Map([["op-1", operationFact({ courierName: "أحمد سمير" })]]),
  });

  assert.equal(line.courierName, "أحمد سمير");
});

test("courier statements never tag the account owner as a courier", () => {
  const [line] = build({ partyType: "courier", rows: [journalRow({ creditMinor: 3800 })] });

  assert.equal(line.courierName, null);
  assert.equal(line.credit, 38);
});

test("a line without a courier stays untagged rather than using a placeholder", () => {
  const [line] = build({
    facts: new Map([["op-1", operationFact({ courierId: null, courierName: null })]]),
  });

  assert.equal(line.courierName, null);
});

test("non-order journal lines carry no order or courier fields", () => {
  const [line] = build({
    rows: [
      journalRow({
        sourceType: "manual_adjustment",
        sourceId: null,
        debitMinor: 500,
        creditMinor: 0,
        memo: "تسوية يدوية",
      }),
    ],
  });

  assert.equal(line.orderNumber, undefined);
  assert.equal(line.orderValue, undefined);
  assert.equal(line.courierName, null);
  assert.equal(line.running, 15);
});
