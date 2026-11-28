import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const cod = loadTsModule(
  path.join(projectRoot, "src/lib/operations/cod-settlement.ts"),
);

/**
 * The corrected COD model moves real money, so these pin the two worked
 * examples from the settlement review. All amounts are in piastres.
 *
 *   كبده الفلاح: subtotal 120, collected 89, fee 7, 10% commission
 *     → merchant receivable 12.00, courier net 38.00, with one attended day
 *       the courier payable is 38 + 165 = 203.00.
 *
 *   شابلن: subtotal 570, collected 532, fee 7, 15% commission
 *     → merchant receivable 85.50, courier net 45.00, with one attended day
 *       the courier payable is 45 + 165 = 210.00.
 */

test("كبده الفلاح merchant owes 12.00 on a 10% commission", () => {
  assert.equal(cod.merchantCommissionMinor(12_000, 10), 1_200);
});

test("شابلن merchant owes 85.50 on a 15% commission", () => {
  assert.equal(cod.merchantCommissionMinor(57_000, 15), 8_550);
});

test("a zero-rate merchant owes no commission", () => {
  assert.equal(cod.merchantCommissionMinor(57_000, 0), 0);
});

test("كبده الفلاح courier net is 38.00 (120 − 89 + 7)", () => {
  assert.equal(
    cod.courierOrderNetMinor({
      subtotalMinor: 12_000,
      codCollectedMinor: 8_900,
      courierFeeMinor: 700,
    }),
    3_800,
  );
});

test("شابلن courier net is 45.00 (570 − 532 + 7)", () => {
  assert.equal(
    cod.courierOrderNetMinor({
      subtotalMinor: 57_000,
      codCollectedMinor: 53_200,
      courierFeeMinor: 700,
    }),
    4_500,
  );
});

test("a courier net can be negative when the cash collected exceeds the subtotal", () => {
  assert.equal(
    cod.courierOrderNetMinor({
      subtotalMinor: 5_000,
      codCollectedMinor: 6_900,
      courierFeeMinor: 700,
    }),
    -1_200,
  );
});

test("tips add to the courier claim", () => {
  assert.equal(
    cod.courierOrderNetMinor({
      subtotalMinor: 12_000,
      codCollectedMinor: 8_900,
      courierFeeMinor: 700,
      tipMinor: 500,
    }),
    4_300,
  );
});

test("كبده الفلاح courier payable is 203.00 with one attended day", () => {
  assert.equal(cod.courierPayableMinor([3_800], 1), 20_300);
});

test("شابلن courier payable is 210.00 with one attended day", () => {
  assert.equal(cod.courierPayableMinor([4_500], 1), 21_000);
});

test("orders accumulate and each attended day adds 165.00", () => {
  assert.equal(cod.courierPayableMinor([3_800, -1_200, 4_500], 2), 40_100);
});
