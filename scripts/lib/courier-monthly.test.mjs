import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const monthly = loadTsModule(
  path.join(projectRoot, "src/lib/couriers/monthly.ts"),
);

const NOW = new Date("2026-11-11T09:00:00.000Z");

test("startOfMonth is the first instant of the UTC month", () => {
  assert.equal(monthly.startOfMonth(NOW), "2026-11-01T00:00:00.000Z");
});

test("all-time earnings and delivery counts include every month", () => {
  const totals = monthly.summarizeCourierOperations(
    [
      { courierId: "a", profit: 10, gross: 100, occurredAt: "2026-09-15T00:00:00.000Z" },
      { courierId: "a", profit: 5, gross: 50, occurredAt: "2026-11-02T00:00:00.000Z" },
    ],
    NOW,
  );
  assert.equal(totals.earnings.get("a"), 15);
  assert.equal(totals.deliveries.get("a"), 2);
});

test("monthly figures only include the current calendar month", () => {
  const totals = monthly.summarizeCourierOperations(
    [
      { courierId: "a", profit: 10, gross: 100, occurredAt: "2026-10-31T23:59:59.000Z" },
      { courierId: "a", profit: 5, gross: 50, occurredAt: "2026-11-01T00:00:00.000Z" },
      { courierId: "a", profit: 2, gross: 20, occurredAt: "2026-11-10T12:00:00.000Z" },
    ],
    NOW,
  );
  assert.equal(totals.monthlyProfit.get("a"), 7);
  assert.equal(totals.monthlyDeliveryAmount.get("a"), 70);
});

test("figures are keyed per courier independently", () => {
  const totals = monthly.summarizeCourierOperations(
    [
      { courierId: "a", profit: 5, gross: 50, occurredAt: "2026-11-02T00:00:00.000Z" },
      { courierId: "b", profit: 9, gross: 90, occurredAt: "2026-11-03T00:00:00.000Z" },
    ],
    NOW,
  );
  assert.equal(totals.monthlyProfit.get("a"), 5);
  assert.equal(totals.monthlyProfit.get("b"), 9);
  assert.equal(totals.monthlyDeliveryAmount.get("a"), 50);
  assert.equal(totals.monthlyDeliveryAmount.get("b"), 90);
});

test("a courier with no operations has no map entry", () => {
  const totals = monthly.summarizeCourierOperations([], NOW);
  assert.equal(totals.earnings.has("ghost"), false);
  assert.equal(totals.monthlyProfit.has("ghost"), false);
});
