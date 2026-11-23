import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { parseCouponUsageReportRows } = loadTsModule(
  path.join(projectRoot, "src/lib/coupons/usage-report.ts"),
);

function usage(overrides = {}) {
  return {
    coupon_code: "kanjo",
    coupon_type: "PERCENTAGE_DISCOUNT",
    discount_funded_by: "SPLIT",
    uses_count: "3",
    discount_amount: "120.50",
    shipping_discount: "15",
    cashback_amount: "5.25",
    total_impact: "",
    platform_funded_amount: "70.25",
    vendor_funded_amount: "60.25",
    last_used_at: "2026-11-15T11:00:00Z",
    ...overrides,
  };
}

test("parses coupon usage rows into minor units", () => {
  const { rows, issues, duplicates } = parseCouponUsageReportRows([usage()]);

  assert.equal(issues.length, 0);
  assert.equal(duplicates, 0);
  assert.deepEqual(rows, [
    {
      code: "KANJO",
      couponType: "percentage_discount",
      discountFundedBy: "split",
      usesCount: 3,
      discountAmount: 12050,
      shippingDiscount: 1500,
      cashbackAmount: 525,
      totalImpact: 14075,
      platformFunded: 7025,
      vendorFunded: 6025,
      lastUsedAt: "2026-11-15T11:00:00.000Z",
    },
  ]);
});

test("falls back to summed impact when total_impact is empty", () => {
  const { rows } = parseCouponUsageReportRows([
    usage({ total_impact: "999" }),
    usage({ coupon_code: "ASEM100", total_impact: "" }),
  ]);

  assert.equal(rows[0].totalImpact, 99900);
  assert.equal(rows[1].totalImpact, 14075);
});

test("dedupes by uppercase code, keeping the last row", () => {
  const { rows, duplicates } = parseCouponUsageReportRows([
    usage({ uses_count: "1" }),
    usage({ coupon_code: " Kanjo ", uses_count: "7" }),
  ]);

  assert.equal(duplicates, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "KANJO");
  assert.equal(rows[0].usesCount, 7);
});

test("keeps unused codes and reports missing codes as issues", () => {
  const { rows, issues } = parseCouponUsageReportRows([
    usage({ coupon_code: "MOHAMED1", uses_count: "0" }),
    usage({ coupon_code: "" }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].usesCount, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /مفقود/);
});

test("normalises unknown enums and invalid timestamps", () => {
  const { rows } = parseCouponUsageReportRows([
    usage({
      coupon_type: "mystery",
      discount_funded_by: "nobody",
      last_used_at: "not-a-date",
    }),
  ]);

  assert.equal(rows[0].couponType, "fixed_amount");
  assert.equal(rows[0].discountFundedBy, "platform");
  assert.equal(rows[0].lastUsedAt, null);
});

test("treats malformed money as zero instead of NaN", () => {
  const { rows } = parseCouponUsageReportRows([
    usage({ discount_amount: "n/a", shipping_discount: "", cashback_amount: null }),
  ]);

  assert.equal(rows[0].discountAmount, 0);
  assert.equal(rows[0].shippingDiscount, 0);
  assert.equal(rows[0].cashbackAmount, 0);
});
