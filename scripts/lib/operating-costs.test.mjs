import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const costs = loadTsModule(
  path.join(projectRoot, "src/lib/bi/operating-costs.ts"),
);

function fact(overrides = {}) {
  return {
    day: "2026-11-15",
    code: "5100",
    sourceType: "courier_attendance",
    sourceId: "attendance:c1:2026-11-15",
    partyType: null,
    partyId: null,
    debitMinor: 0,
    creditMinor: 0,
    ...overrides,
  };
}

const FACTS = [
  fact({ sourceId: "attendance:c1:2026-11-15", debitMinor: 16500 }),
  fact({
    day: "2026-11-20",
    sourceId: "attendance:c2:2026-11-20",
    debitMinor: 16500,
  }),
  /* Per-order courier pay: already in the order profit. */
  fact({ sourceType: "operation", sourceId: null, debitMinor: 50000 }),
  /* Coupon expense: already in the order discounts. */
  fact({ code: "5000", sourceType: "operation", sourceId: null, debitMinor: 100000 }),
  /* Courier bonus (debit) and other operating revenue (credit). */
  fact({ code: "5110", sourceType: "manual_adjustment", sourceId: null, debitMinor: 8950 }),
  fact({ code: "4900", sourceType: "manual_adjustment", sourceId: null, creditMinor: 5000 }),
  /* Bank-funded operating expense. */
  fact({ code: "5400", sourceType: "bank_movement", sourceId: null, debitMinor: 20000 }),
];

test("summarizeOperatingCosts splits the ledger into stipends, adjustments and expenses", () => {
  const summary = costs.summarizeOperatingCosts(FACTS);

  assert.equal(summary.attendanceDays, 2);
  assert.equal(summary.dailyStipends, 330);
  assert.equal(summary.manualAdjustments, 39.5);
  assert.equal(summary.operatingExpenses, 200);
  assert.equal(summary.totalCosts, 569.5);
});

test("filterOperatingCosts narrows attendance by courier and city, leaves fixed costs", () => {
  const lookups = {
    courierCityId: new Map([
      ["c1", "cairo"],
      ["c2", "giza"],
    ]),
  };

  const byCourier = costs.filterOperatingCosts(
    FACTS,
    { from: "", to: "", courierId: "c1", cityId: null },
    lookups,
  );
  const courierSummary = costs.summarizeOperatingCosts(byCourier);
  assert.equal(courierSummary.dailyStipends, 165);
  assert.equal(courierSummary.attendanceDays, 1);
  /* Bonuses and operating expenses are company-wide and stay in view. */
  assert.equal(courierSummary.manualAdjustments, 39.5);
  assert.equal(courierSummary.operatingExpenses, 200);

  const byCity = costs.filterOperatingCosts(
    FACTS,
    { from: "", to: "", courierId: null, cityId: "giza" },
    lookups,
  );
  assert.equal(costs.summarizeOperatingCosts(byCity).dailyStipends, 165);

  const windowed = costs.filterOperatingCosts(
    FACTS,
    { from: "2026-11-16", to: "", courierId: null, cityId: null },
    lookups,
  );
  assert.equal(costs.summarizeOperatingCosts(windowed).dailyStipends, 165);
});

test("computeNetProfit deducts the fixed costs from the order profit", () => {
  const summary = costs.summarizeOperatingCosts(FACTS);
  const net = costs.computeNetProfit(2739.43, 6634.34, 179, summary);

  assert.equal(net.netProfit, 2739.43 - 569.5);
  assert.ok(Math.abs(net.netMargin - (2739.43 - 569.5) / 6634.34) < 1e-9);
  assert.ok(Math.abs(net.netPerOrder - (2739.43 - 569.5) / 179) < 1e-9);

  const loss = costs.computeNetProfit(100, 0, 0, summary);
  assert.equal(loss.netProfit, 100 - 569.5);
  assert.equal(loss.netMargin, 0);
  assert.equal(loss.netPerOrder, 0);
});
