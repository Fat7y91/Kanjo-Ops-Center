import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const profitability = loadTsModule(
  path.join(projectRoot, "src/lib/bi/profitability.ts"),
);
const clearingExport = loadTsModule(
  path.join(projectRoot, "src/lib/operations/clearinghouse-export.ts"),
);

/**
 * The order P&L waterfall must hold its three identities in minor units:
 *
 *   commissions + delivery margin = gross order revenue
 *   gross order revenue - coupons = profit before the courier base
 *   profit before the courier base - daily base = net operating result
 *
 * The tiered fee is 7 EGP for the first 15 orders a partner delivers in a day
 * and 15 EGP above that; the 165 EGP attendance base is a separate footer row.
 */

function fact(overrides = {}) {
  return {
    deliveryDate: "2026-11-20",
    cityId: "city-desouk",
    courierId: "courier-1",
    commissionMinor: 0,
    deliveryFeeMinor: 1900,
    shippingDiscountMinor: 0,
    discountMinor: 0,
    rewardDiscountMinor: 0,
    ...overrides,
  };
}

function base(overrides = {}) {
  return {
    courierId: "courier-1",
    day: "2026-11-20",
    amountMinor: 16500,
    ...overrides,
  };
}

test("tiered fee uses 7 EGP for the first 15 orders and 15 EGP above", () => {
  assert.equal(profitability.tieredOrderFeeMinor(0), 0);
  assert.equal(profitability.tieredOrderFeeMinor(3), 2100);
  assert.equal(profitability.tieredOrderFeeMinor(15), 10500);
  assert.equal(profitability.tieredOrderFeeMinor(16), 12000);
  assert.equal(profitability.tieredOrderFeeMinor(20), 18000);
});

test("the three waterfall identities hold with no rounding drift", () => {
  const facts = [
    ...Array.from({ length: 20 }, () =>
      fact({ commissionMinor: 1000, discountMinor: 500 }),
    ),
    ...Array.from({ length: 3 }, () =>
      fact({
        deliveryDate: "2026-11-21",
        courierId: "courier-2",
        shippingDiscountMinor: 1900,
      }),
    ),
  ];
  const bases = [
    base(),
    base({ courierId: "courier-2", day: "2026-11-21" }),
    // Manual 0-order attendance day in the slice: still counted.
    base({ day: "2026-11-19" }),
  ];

  const minor = profitability.computeProfitabilityMinor(facts, bases);

  assert.equal(minor.orders, 23);
  assert.equal(minor.commissions, 20000);
  assert.equal(minor.deliveryMargin, 17900);
  assert.equal(minor.grossRevenue, 37900);
  assert.equal(minor.coupons, 10000);
  assert.equal(minor.orderProfitBeforeBase, 27900);
  assert.equal(minor.courierDailyBase, 49500);
  assert.equal(minor.netOperating, -21600);

  assert.equal(minor.commissions + minor.deliveryMargin, minor.grossRevenue);
  assert.equal(minor.grossRevenue - minor.coupons, minor.orderProfitBeforeBase);
  assert.equal(
    minor.orderProfitBeforeBase - minor.courierDailyBase,
    minor.netOperating,
  );
});

test("the summary converts once from minor units and keeps the same rows", () => {
  const facts = [fact({ commissionMinor: 1000, discountMinor: 500 })];
  const summary = profitability.computeProfitability(facts, [base()], {
    from: null,
    to: null,
    cityId: null,
    cities: [],
  });

  assert.equal(summary.commissions, 10);
  assert.equal(summary.deliveryMargin, 12);
  assert.equal(summary.grossRevenue, 22);
  assert.equal(summary.coupons, 5);
  assert.equal(summary.orderProfitBeforeBase, 17);
  assert.equal(summary.averagePerOrder, 17);
  assert.equal(summary.courierDailyBase, 165);
  assert.equal(summary.netOperating, -148);
  assert.equal(
    Math.round(summary.commissions * 100) +
      Math.round(summary.deliveryMargin * 100),
    Math.round(summary.grossRevenue * 100),
  );
});

test("an empty slice returns zeros without dividing by zero", () => {
  const summary = profitability.computeProfitability([], [], {
    from: "2026-11-01",
    to: "2026-11-30",
    cityId: "city-desouk",
    cities: [{ id: "city-desouk", name: "دسوق" }],
  });

  assert.equal(summary.orders, 0);
  assert.equal(summary.averagePerOrder, 0);
  assert.equal(summary.netOperating, 0);
});

test("the settlement workbook gains the exact P&L sheet", () => {
  const summary = {
    orders: 25,
    currency: "EGP",
    from: null,
    to: null,
    cityId: null,
    cities: [],
    commissions: 547.36,
    deliveryMargin: 167,
    grossRevenue: 714.36,
    coupons: 457,
    orderProfitBeforeBase: 257.36,
    averagePerOrder: 10.29,
    courierDailyBase: 1815,
    netOperating: -1557.64,
  };

  const sheets = clearingExport.buildClearingSheets({
    periodLabel: "كل الفترات",
    generatedAt: "2026-11-21 10:00",
    range: { from: null, to: null },
    totals: { receivables: 0, payables: 0, net: 0 },
    receivables: [],
    payables: [],
    profitability: summary,
  });

  const sheet = sheets.find((entry) => entry.name === "ربحية الطلبات");
  assert.ok(sheet);
  assert.deepEqual(
    sheet.rows.map((row) => row["البند"]),
    [
      "إجمالي العمولات المستحقة",
      "إجمالي ربحية التوصيل",
      "إجمالي الإيراد (العمولات + ربحية التوصيل)",
      "إجمالي الكوبونات والخصومات",
      "ربحية الطلبات قبل خصم مصاريف مناديب التوصيل",
      "- مصاريف يوميات المناديب الثابتة",
      "= صافي ربح/خسارة التشغيل الفعلي",
    ],
  );
  assert.deepEqual(
    sheet.rows.map((row) => row["القيمة"]),
    [547.36, 167, 714.36, 457, 257.36, 1815, -1557.64],
  );
});

test("the P&L sheet is omitted when the card has no data yet", () => {
  const sheets = clearingExport.buildClearingSheets({
    periodLabel: "كل الفترات",
    generatedAt: "2026-11-21 10:00",
    range: { from: null, to: null },
    totals: { receivables: 0, payables: 0, net: 0 },
    receivables: [],
    payables: [],
  });

  assert.equal(
    sheets.some((entry) => entry.name === "ربحية الطلبات"),
    false,
  );
});

test("internal-staff exclusion drops courier pay but keeps commissions and orders", () => {
  const facts = [
    fact({ courierId: "normal", commissionMinor: 1_000 }),
    fact({
      courierId: "internal",
      commissionMinor: 2_000,
      discountMinor: 500,
      isInternalStaff: true,
    }),
  ];
  const bases = [
    base({ courierId: "normal" }),
    base({ courierId: "internal", isInternalStaff: true }),
  ];

  const all = profitability.computeProfitabilityMinor(facts, bases);
  const scoped = profitability.computeProfitabilityMinor(facts, bases, {
    excludeInternalStaff: true,
  });

  assert.equal(scoped.orders, all.orders);
  assert.equal(scoped.commissions, all.commissions);
  assert.equal(scoped.coupons, all.coupons);
  // The internal order no longer carries its 7 EGP courier fee.
  assert.equal(scoped.deliveryMargin, all.deliveryMargin + 700);
  // The internal 165 EGP attendance base is gone.
  assert.equal(scoped.courierDailyBase, all.courierDailyBase - 16_500);
  assert.equal(scoped.netOperating, all.netOperating + 700 + 16_500);
});

test("accrual P&L is identical before and after a settlement", () => {
  const facts = [
    fact({ courierId: "courier-1", commissionMinor: 1_500 }),
    fact({ deliveryDate: "2026-11-21", courierId: "courier-2" }),
  ];
  const bases = [base(), base({ courierId: "courier-2", day: "2026-11-21" })];
  const meta = {
    from: "2026-11-19",
    to: "2026-11-22",
    cityId: null,
    cities: [],
  };

  // A settlement only moves a party balance. The accrual facts and the
  // attendance bases are untouched, so every P&L row must stay identical.
  const before = profitability.computeProfitability(facts, bases, meta);
  const after = profitability.computeProfitability(facts, bases, meta);

  assert.deepEqual(after, before);
  assert.equal(after.orders, 2);
  assert.equal(after.commissions, 15);
});
