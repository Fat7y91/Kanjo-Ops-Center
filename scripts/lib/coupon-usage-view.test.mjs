import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { summarizeDeliveredUsage } = loadTsModule(
  path.join(projectRoot, "src/lib/coupons/delivered-usage.ts"),
);
const { buildCouponUsageView } = loadTsModule(
  path.join(projectRoot, "src/lib/coupons/usage-view.ts"),
);
const { amount } = loadTsModule(
  path.join(projectRoot, "src/lib/bi/format.ts"),
);

function reportRow(overrides = {}) {
  return {
    code: "KANJO",
    couponType: "free_shipping",
    discountFundedBy: "platform",
    usesCount: 25,
    discountAmount: 0,
    shippingDiscount: 475,
    cashbackAmount: 0,
    totalImpact: 475,
    platformFunded: 475,
    vendorFunded: 0,
    lastUsedAt: null,
    importedAt: "2026-12-13T00:00:00.000Z",
    ...overrides,
  };
}

const reportRows = [
  reportRow({ code: "MOHAMED1", usesCount: 1, shippingDiscount: 50, totalImpact: 50, platformFunded: 50 }),
  reportRow({ code: "FYN100KA", usesCount: 2, discountAmount: 75, shippingDiscount: 0, totalImpact: 75, platformFunded: 75 }),
  reportRow(),
  reportRow({ code: "ASEM100", usesCount: 3, discountAmount: 160.5, shippingDiscount: 0, totalImpact: 160.5, platformFunded: 160.5 }),
];

const deliveredWithoutCodes = summarizeDeliveredUsage([
  { coupon_code: "", discount_minor: 86750, shipping_discount_minor: 26600, reward_discount_minor: 0 },
]);

test("report mode uses exact EGP and sorts by impact then uses", () => {
  const view = buildCouponUsageView({
    mode: "report",
    reportRows,
    delivered: deliveredWithoutCodes,
    showUnused: false,
  });
  assert.equal(view.totals.totalImpact, 760.5);
  assert.deepEqual(
    view.rows.map((row) => row.code),
    ["KANJO", "ASEM100", "FYN100KA", "MOHAMED1"],
  );
  assert.equal(view.rows[3].totalImpact, 50);
  assert.equal(amount(view.rows[3].totalImpact), "50.00");
  assert.notEqual(view.rows[3].totalImpact, 5000);
});

test("delivered mode shows KPI actuals when the export has no coupon codes", () => {
  const view = buildCouponUsageView({
    mode: "delivered",
    reportRows,
    delivered: deliveredWithoutCodes,
    showUnused: false,
  });
  assert.equal(view.hasDeliveredCodes, false);
  assert.equal(view.rows.length, 0);
  assert.equal(view.totals.totalImpact.toFixed(2), "1133.50");
  assert.equal(deliveredWithoutCodes.discountAmount.toFixed(2), "867.50");
  assert.equal(deliveredWithoutCodes.shippingDiscount.toFixed(2), "266.00");
});

test("delivered mode groups per code once coupon_code exists", () => {
  const delivered = summarizeDeliveredUsage([
    { coupon_code: "kanjo", discount_minor: 10000, shipping_discount_minor: 0, reward_discount_minor: 0 },
    { coupon_code: "kanjo", discount_minor: 5000, shipping_discount_minor: 1000, reward_discount_minor: 0 },
    { coupon_code: "MOHAMED1", discount_minor: 5000, shipping_discount_minor: 0, reward_discount_minor: 0 },
  ]);
  const view = buildCouponUsageView({
    mode: "delivered",
    reportRows,
    delivered,
    showUnused: false,
  });
  assert.equal(view.hasDeliveredCodes, true);
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[0].code, "KANJO");
  assert.equal(view.rows[0].usesCount, 2);
  assert.equal(view.rows[0].totalImpact, 160);
  assert.equal(view.rows[1].code, "MOHAMED1");
  assert.equal(view.rows[1].totalImpact, 50);
  assert.equal(view.totals.totalImpact, 210);
});

test("switching back to report mode restores the full imported total", () => {
  const delivered = summarizeDeliveredUsage([
    { coupon_code: "KANJO", discount_minor: 5000, shipping_discount_minor: 0, reward_discount_minor: 0 },
  ]);
  const report = buildCouponUsageView({
    mode: "report",
    reportRows,
    delivered,
    showUnused: false,
  });
  const actual = buildCouponUsageView({
    mode: "delivered",
    reportRows,
    delivered,
    showUnused: false,
  });
  assert.equal(report.totals.totalImpact, 760.5);
  assert.equal(actual.totals.totalImpact, 50);
});
