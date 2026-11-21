import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const pay = loadTsModule(
  path.join(projectRoot, "src/lib/couriers/tiered-pay.ts"),
);

/**
 * The daily pay engine moves real money, so these pin the agreement exactly:
 * 165 EGP fixed per attended day, 7 EGP for the first 15 orders and 15 EGP for
 * every order above 15. All amounts are in piastres (minor units).
 */

function deliveries(count, courierId = "c-1", day = "2026-11-11") {
  return Array.from({ length: count }, (_, index) => ({
    courierId,
    deliveredAt: `${day}T12:${String(index).padStart(2, "0")}:00.000Z`,
  }));
}

test("one delivered order pays the base plus one tier-1 order (172 EGP)", () => {
  const summary = pay.computeCourierPay("c-1", deliveries(1), []);
  assert.equal(summary.totalMinor, 17_200);
  assert.equal(summary.baseMinor, 16_500);
  assert.equal(summary.tier1Minor, 700);
  assert.equal(summary.attendanceDays, 1);
});

test("hitting the 15-order target pays 165 + 15×7 (270 EGP)", () => {
  const summary = pay.computeCourierPay("c-1", deliveries(15), []);
  assert.equal(summary.totalMinor, 27_000);
  assert.equal(summary.tier2Minor, 0);
});

test("18 delivered orders pay 165 + 15×7 + 3×15 (315 EGP)", () => {
  const summary = pay.computeCourierPay("c-1", deliveries(18), []);
  assert.equal(summary.totalMinor, 31_500);
  assert.equal(summary.tier1Minor, 10_500);
  assert.equal(summary.tier2Minor, 4_500);
});

test("a manually marked present day with no orders still pays the 165 base", () => {
  const summary = pay.computeCourierPay(
    "c-1",
    [],
    [{ courierId: "c-1", day: "2026-11-11", status: "present" }],
  );
  assert.equal(summary.totalMinor, 16_500);
  assert.equal(summary.attendanceDays, 1);
  assert.equal(summary.days[0].status, "present");
});

test("an absent day keeps the order tiers but pays no base", () => {
  const summary = pay.computeCourierPay(
    "c-1",
    deliveries(3),
    [{ courierId: "c-1", day: "2026-11-11", status: "absent" }],
  );
  assert.equal(summary.baseMinor, 0);
  assert.equal(summary.totalMinor, 2_100);
  assert.equal(summary.attendanceDays, 0);
});

test("tiers reset per day and couriers never share days", () => {
  const rows = [...deliveries(10, "c-1"), ...deliveries(20, "c-2")];
  const first = pay.computeCourierPay("c-1", rows, []);
  const second = pay.computeCourierPay("c-2", rows, []);
  assert.equal(first.totalMinor, 16_500 + 10 * 700);
  assert.equal(second.totalMinor, 16_500 + 15 * 700 + 5 * 1_500);
  assert.equal(first.days.length, 1);
});

test("a bare date is treated as its own Cairo day", () => {
  const summary = pay.computeCourierPay(
    "c-1",
    [{ courierId: "c-1", deliveredAt: "2026-11-11" }],
    [],
  );
  assert.equal(summary.days[0].day, "2026-11-11");
});
