import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const report = loadTsModule(
  path.join(projectRoot, "src/lib/operations/clearing-report.ts"),
);

function account(overrides) {
  return {
    accountId: "a1",
    partyType: "courier",
    partyId: "c1",
    partyName: "أحمد",
    currency: "EGP",
    balance: -150.5,
    workingDates: ["2026-11-01", "2026-11-20", "2026-12-01"],
    ...overrides,
  };
}

function stats(overrides) {
  return {
    orderCount: 4,
    debitMinor: 10_000,
    creditMinor: 25_050,
    ...overrides,
  };
}

test("buildClearingReport aggregates orders, money and in-range working days", () => {
  const built = report.buildClearingReport({
    kind: "payables",
    accounts: [account()],
    stats: new Map([["a1", stats()]]),
    range: { from: "2026-11-01", to: "2026-11-30" },
    periodLabel: "نوفمبر",
    generatedAt: "2026-11-30 12:00",
  });

  assert.equal(built.rows[0].orderCount, 4);
  assert.equal(built.rows[0].workingDays, 2);
  assert.equal(built.rows[0].debit, 100);
  assert.equal(built.rows[0].credit, 250.5);
  assert.equal(built.rows[0].net, -150.5);
  assert.deepEqual(built.totals, {
    orders: 4,
    workingDays: 2,
    debit: 100,
    credit: 250.5,
    net: 150.5,
  });
});

test("merchants have no working-day count", () => {
  const built = report.buildClearingReport({
    kind: "collections",
    accounts: [
      account({
        accountId: "m1",
        partyType: "merchant",
        partyId: "KJ-1",
        partyName: "مطعم",
        balance: 900,
      }),
    ],
    stats: new Map([["m1", stats({ orderCount: 6, debitMinor: 90_000, creditMinor: 0 })]]),
    range: { from: null, to: null },
    periodLabel: "كل الفترات",
    generatedAt: "2026-11-30 12:00",
  });

  assert.equal(built.rows[0].workingDays, null);
  assert.equal(built.rows[0].orderCount, 6);
  assert.equal(built.totals.workingDays, 0);
  assert.equal(built.totals.orders, 6);
  assert.equal(built.title, "كشف إجمالي التحصيلات المعتمدة");
});

test("missing stats yield zero money but keep the account row", () => {
  const built = report.buildClearingReport({
    kind: "payables",
    accounts: [account({ accountId: "a2" })],
    stats: new Map(),
    range: { from: null, to: null },
    periodLabel: "كل الفترات",
    generatedAt: "2026-11-30 12:00",
  });

  assert.equal(built.rows[0].orderCount, 0);
  assert.equal(built.rows[0].debit, 0);
  assert.equal(built.rows[0].credit, 0);
});
