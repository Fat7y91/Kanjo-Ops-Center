import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const pay = loadTsModule(path.join(projectRoot, "src/lib/couriers/tiered-pay.ts"));

/**
 * The operating day is 14:00 → 14:00 Africa/Cairo. These pin the boundary and
 * the summer DST offset, because a wrong day moves real courier money.
 */

test("a delivery at 13:59 Cairo still belongs to the previous operating day", () => {
  assert.equal(
    pay.toKanjoBusinessDay("2026-11-20T13:59:00+02:00"),
    "2026-11-19",
  );
  assert.equal(
    pay.toKanjoBusinessDay("2026-11-20T14:00:00+02:00"),
    "2026-11-20",
  );
});

test("a 02:30 Cairo delivery belongs to the previous operating day", () => {
  assert.equal(
    pay.toKanjoBusinessDay("2026-11-20T02:30:00+02:00"),
    "2026-11-19",
  );
});

test("the boundary follows Cairo summer time", () => {
  // July is UTC+3: 10:59Z is 13:59 Cairo, 11:00Z is 14:00 Cairo.
  assert.equal(
    pay.toKanjoBusinessDay("2026-07-01T10:59:00Z"),
    "2026-06-30",
  );
  assert.equal(pay.toKanjoBusinessDay("2026-07-01T11:00:00Z"), "2026-07-01");
});

test("a bare date is already an operating-day label", () => {
  assert.equal(pay.toKanjoBusinessDay("2026-11-20"), "2026-11-20");
});

test("tiers group the after-midnight delivery with the prior day", () => {
  const summary = pay.computeCourierPay(
    "c-1",
    [
      { courierId: "c-1", deliveredAt: "2026-11-19T23:30:00+02:00" },
      { courierId: "c-1", deliveredAt: "2026-11-20T02:30:00+02:00" },
    ],
    [],
  );
  assert.equal(summary.days.length, 1);
  assert.equal(summary.days[0].day, "2026-11-19");
  assert.equal(summary.days[0].deliveredOrders, 2);
  assert.equal(summary.totalMinor, 16_500 + 2 * 700);
});
