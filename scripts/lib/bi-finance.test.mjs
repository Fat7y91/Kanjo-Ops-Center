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
    commission: 100,
    courierCut: 20,
    couponDiscount: 0,
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

  assert.equal(finance.collected, 100);
  assert.equal(finance.driverCommissions, 10);
  assert.equal(finance.net, 110);
  assert.equal(finance.expenses, 47840.06);
  assert.equal(finance.receivables, 1500);
  assert.equal(finance.payables, 700);
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
