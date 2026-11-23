import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { summarizeOrderMetrics } = loadTsModule(
  path.join(projectRoot, "src/lib/bi/order-metrics.ts"),
);
const { buildFinance, scopeDataset, DEFAULT_BI_FILTERS } = (() => {
  const select = loadTsModule(path.join(projectRoot, "src/lib/bi/select.ts"));
  const types = loadTsModule(path.join(projectRoot, "src/lib/bi/types.ts"));
  return { ...select, DEFAULT_BI_FILTERS: types.DEFAULT_BI_FILTERS };
})();

function order(overrides = {}) {
  return {
    date: "2026-11-15",
    merchantId: "m1",
    merchantName: "تاجر",
    cityId: "c1",
    courierId: "d1",
    courierName: "مندوب",
    couponCode: "",
    currency: "EGP",
    orders: 1,
    volume: 1000,
    deliveryFee: 30,
    orderDiscount: 0,
    shippingDiscount: 0,
    commission: 100,
    courierCut: 20,
    couponDiscount: 0,
    rewardDiscount: 0,
    platformFunded: 0,
    vendorFunded: 0,
    walletDiscount: 0,
    ...overrides,
  };
}

function merchant(overrides = {}) {
  return {
    id: "m1",
    name: "تاجر",
    cityId: "c1",
    cityName: "القاهرة",
    team: "City Operations",
    repId: null,
    repName: null,
    vendorTypeId: 1,
    vendorType: "مطعم",
    stage: "signed",
    monthlyValue: 0,
    targetCommission: 0,
    achievedCommission: 0,
    collected: 0,
    documents: { cr: true, tax: true, menu: true },
    visitedAt: "2026-11-01",
    lastVisitAt: "2026-11-01",
    ...overrides,
  };
}

function dataset(overrides = {}) {
  return {
    generatedAt: "2026-11-15T00:00:00.000Z",
    cities: [],
    teams: [],
    reps: [],
    vendorTypes: [],
    merchants: [merchant()],
    expenses: [
      {
        id: "e1",
        label: "مصروف",
        category: "logistics",
        amount: 47840.06,
        incurredAt: "2026-11-15",
        cityId: "c1",
        cityName: "القاهرة",
        team: "Executive",
      },
    ],
    marketing: [],
    catalog: [],
    orders: [order()],
    partyBalances: [
      { currency: "EGP", receivables: 1500, payables: 700 },
      { currency: "SAR", receivables: 0, payables: 0 },
    ],
    treasury: [],
    accounts: [],
    ledger: [],
    payslips: [],
    ...overrides,
  };
}

test("order summary separates merchant and driver operational collection", () => {
  const summary = summarizeOrderMetrics([
    order(),
    order({ deliveryFee: 10, courierCut: 20, commission: 50 }),
  ]);

  assert.equal(summary.merchantCommission, 150);
  assert.equal(summary.driverCommission, 10);
  assert.equal(summary.operationalCollection, 160);
});

test("net collection never subtracts corporate expenses", () => {
  const finance = buildFinance(
    [merchant()],
    [order()],
    dataset().expenses,
    dataset().partyBalances,
  );

  assert.equal(finance.collected, 0);
  assert.equal(finance.driverCommissions, 10);
  assert.equal(finance.net, 110);
  assert.equal(finance.netPosition, 800);
  assert.equal(finance.expenses, 47840.06);
  assert.equal(finance.receivables, 1500);
  assert.equal(finance.payables, 700);
});

test("collected is posted settlement cash-in, not accrued commission", () => {
  const finance = buildFinance(
    [merchant()],
    [order({ commission: 100 })],
    [],
    [
      { currency: "EGP", receivables: 1500, payables: 700, collected: 250 },
      { currency: "SAR", receivables: 0, payables: 0, collected: 0 },
    ],
  );

  assert.equal(finance.collected, 250);
  assert.equal(finance.netPosition, 800);
});

test("party balances stay absolute while orders obey the date filter", () => {
  const scoped = scopeDataset(
    dataset({
      orders: [
        order({ date: "2026-11-15" }),
        order({ date: "2020-01-01", commission: 999 }),
      ],
    }),
    { ...DEFAULT_BI_FILTERS, range: "30d" },
  );

  assert.equal(scoped.orders.length, 1);
  assert.equal(scoped.orders[0].commission, 100);
  assert.deepEqual(scoped.partyBalances, dataset().partyBalances);
});

test("non-EGP orders do not leak into the EGP collection KPI", () => {
  const finance = buildFinance(
    [merchant()],
    [order({ currency: "SAR", commission: 999 })],
    [],
    dataset().partyBalances,
  );

  assert.equal(finance.net, 0);
  assert.equal(finance.collected, 0);
});

test("signed contracts total counts final and signed merchants only", () => {
  const finance = buildFinance(
    [
      merchant({ id: "m1", stage: "signed" }),
      merchant({ id: "m2", stage: "final" }),
      merchant({ id: "m3", stage: "provisional" }),
      merchant({ id: "m4", stage: "no_contract" }),
    ],
    [],
    [],
    dataset().partyBalances,
  );

  assert.equal(finance.signedCount, 1);
  assert.equal(finance.signedContracts, 2);
});

test("imported order and shipping discounts reach the totals and platform profit", () => {
  const summary = summarizeOrderMetrics([
    order({ orderDiscount: 500, shippingDiscount: 100, commission: 150 }),
    order({ orderDiscount: 317.5, shippingDiscount: 147, commission: 150 }),
  ]);

  assert.equal(summary.discounts, 1064.5);
  assert.equal(summary.platformDiscount, 1064.5);
  assert.equal(summary.platformProfit, 300 - 1064.5);
});

test("the generic order discount and coupon amount are never double counted", () => {
  const summary = summarizeOrderMetrics([
    order({
      orderDiscount: 50,
      couponDiscount: 50,
      platformFunded: 20,
      shippingDiscount: 10,
      rewardDiscount: 5,
      walletDiscount: 20,
      commission: 300,
    }),
  ]);

  assert.equal(summary.discounts, 85);
  assert.equal(summary.platformDiscount, 65);
  assert.equal(summary.platformProfit, 300 - 65 - 20);
});

test("legacy coupon rows use the platform share for platform support", () => {
  const summary = summarizeOrderMetrics([
    order({
      orderDiscount: 0,
      couponDiscount: 100,
      platformFunded: 40,
      vendorFunded: 60,
      shippingDiscount: 10,
      rewardDiscount: 5,
      walletDiscount: 20,
      commission: 300,
    }),
  ]);

  assert.equal(summary.discounts, 135);
  assert.equal(summary.platformDiscount, 55);
  assert.equal(summary.platformProfit, 300 - 55 - 20);
  assert.equal(summary.merchantProfit, 1000 - 300 - 60);
});

const { aggregateOrderRows } = loadTsModule(
  path.join(projectRoot, "src/lib/bi/order-metrics-aggregate.ts"),
);

test("order aggregation maps discount_minor and shipping_discount_minor", () => {
  const rows = aggregateOrderRows([
    {
      merchant_id: "m1",
      courier_id: "d1",
      coupon_code: null,
      currency: "EGP",
      order_value_minor: 100000,
      delivery_fee_minor: 3000,
      discount_minor: 1000,
      shipping_discount_minor: 250,
      commission_minor: 10000,
      courier_cut_minor: 2000,
      coupon_discount_minor: null,
      coupon_platform_funded_minor: null,
      coupon_vendor_funded_minor: null,
      wallet_discount_minor: 0,
      reward_discount_minor: 0,
      occurred_at: "2026-11-15T10:00:00Z",
      merchants: { name: "تاجر", city_id: "c1" },
      couriers: { display_name: "مندوب", is_internal_staff: false },
    },
    {
      merchant_id: "m1",
      courier_id: "d1",
      coupon_code: null,
      currency: "EGP",
      order_value_minor: 50000,
      delivery_fee_minor: 3000,
      discount_minor: 500,
      shipping_discount_minor: 0,
      commission_minor: 5000,
      courier_cut_minor: 2000,
      coupon_discount_minor: null,
      coupon_platform_funded_minor: null,
      coupon_vendor_funded_minor: null,
      wallet_discount_minor: 0,
      reward_discount_minor: 0,
      occurred_at: "2026-11-15T11:00:00Z",
      merchants: { name: "تاجر", city_id: "c1" },
      couriers: { display_name: "مندوب", is_internal_staff: false },
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].orders, 2);
  assert.equal(rows[0].volume, 1500);
  assert.equal(rows[0].orderDiscount, 15);
  assert.equal(rows[0].shippingDiscount, 2.5);

  const summary = summarizeOrderMetrics(rows);
  assert.equal(summary.discounts, 17.5);
  assert.equal(summary.platformDiscount, 17.5);
  assert.equal(summary.platformProfit, 150 - 17.5);
});
