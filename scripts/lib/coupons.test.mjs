import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const csv = loadTsModule(path.join(projectRoot, "src/lib/coupons/csv.ts"));
const types = loadTsModule(path.join(projectRoot, "src/lib/coupons/types.ts"));

/**
 * Coupon import parsing is the only place a CSV value becomes money, so these
 * tests pin the unit conversion, the duplicate handling and the funding guard
 * the importer has to preserve before the database re-checks it.
 */

const HEADER_ROW = {
  coupon_code: " WELCOME10 ",
  coupon_type: "fixed_amount",
  active: "true",
  discount_funded_by: "platform",
  vendor_funding_percent: "25",
  stackable: "false",
  stack_priority: "3",
  uses_count: "12",
  discount_amount: "10",
  shipping_discount: "0",
  cashback_amount: "0",
  total_impact: "120",
  vendor_funded_amount: "30",
  platform_funded_amount: "90",
  budget_applied_amount: "120",
  budget_cap: "5000",
  budget_used: "120",
  budget_remaining: "4880",
  last_used_at: "2026-01-02T10:00:00Z",
  created_at: "2025-12-01T09:00:00Z",
};

test("currency columns convert to minor units exactly once", () => {
  const { rows } = csv.parseCouponRows([HEADER_ROW]);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.discountAmountMinor, 1000);
  assert.equal(row.totalImpactMinor, 12000);
  assert.equal(row.vendorFundedMinor, 3000);
  assert.equal(row.platformFundedMinor, 9000);
  assert.equal(row.budgetAppliedMinor, 12000);
  assert.equal(row.budgetCapMinor, 500000);
  assert.equal(row.budgetUsedMinor, 12000);
});

test("codes are trimmed and upper-cased", () => {
  const { rows } = csv.parseCouponRows([HEADER_ROW]);
  assert.equal(rows[0].code, "WELCOME10");
});

test("percentage coupons keep their rate in basis points", () => {
  const { rows } = csv.parseCouponRows([
    { ...HEADER_ROW, coupon_code: "P15", coupon_type: "percentage_discount", discount_amount: "15" },
  ]);
  assert.equal(rows[0].discountAmountMinor, 1500);
});

test("free shipping is forced onto platform funding", () => {
  const { rows } = csv.parseCouponRows([
    {
      ...HEADER_ROW,
      coupon_code: "SHIP",
      coupon_type: "free_shipping",
      discount_funded_by: "vendor",
    },
  ]);
  assert.equal(rows[0].discountFundedBy, "platform");
});

test("a repeated code inside the file is counted, not written twice", () => {
  const result = csv.parseCouponRows([
    HEADER_ROW,
    { ...HEADER_ROW, discount_amount: "99" },
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.rows[0].discountAmountMinor, 1000);
});

test("a blank code is reported with its 1-based file line", () => {
  const result = csv.parseCouponRows([
    HEADER_ROW,
    { ...HEADER_ROW, coupon_code: "  " },
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].line, 3);
});

test("an unknown enum falls back instead of failing the row", () => {
  const { rows } = csv.parseCouponRows([
    { ...HEADER_ROW, coupon_type: "mystery", discount_funded_by: "nobody" },
  ]);
  assert.equal(rows[0].couponType, "fixed_amount");
  assert.equal(rows[0].discountFundedBy, "platform");
});

test("an empty budget cap stays null rather than becoming zero", () => {
  const { rows } = csv.parseCouponRows([{ ...HEADER_ROW, budget_cap: "" }]);
  assert.equal(rows[0].budgetCapMinor, null);
});

test("vendor funding percent is clamped to 0..100", () => {
  const high = csv.parseCouponRows([
    { ...HEADER_ROW, coupon_code: "HIGH", vendor_funding_percent: "140" },
  ]);
  const low = csv.parseCouponRows([
    { ...HEADER_ROW, coupon_code: "LOW", vendor_funding_percent: "-20" },
  ]);
  assert.equal(high.rows[0].vendorFundingPercent, 100);
  assert.equal(low.rows[0].vendorFundingPercent, 0);
});

test("the create schema rejects free shipping funded by the vendor", () => {
  assert.throws(() =>
    types.couponCreateSchema.parse({
      code: "ship",
      couponType: "free_shipping",
      discountFundedBy: "vendor",
    }),
  );
});

test("the create schema normalises the code to upper case", () => {
  const parsed = types.couponCreateSchema.parse({
    code: " welcome ",
    couponType: "fixed_amount",
  });
  assert.equal(parsed.code, "WELCOME");
});

test("percentToBasisPoints matches the CSV unit rule", () => {
  assert.equal(types.percentToBasisPoints(15), 1500);
  assert.equal(types.percentToBasisPoints(0.5), 50);
});
