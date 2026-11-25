import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const report = loadTsModule(
  path.join(projectRoot, "src/lib/operations/clearing-report.ts"),
);

function account(overrides) {
  return {
    accountId: "a1",
    partyType: "courier",
    partyId: "c1",
    partyName: "أحمد",
    currency: "EGP",
    balance: -150.5,
    workingDates: ["2026-11-01", "2026-11-20", "2026-12-01"],
    ...overrides,
  };
}

function stats(overrides) {
  return {
    orderCount: 4,
    debitMinor: 10_000,
    creditMinor: 25_050,
    ...overrides,
  };
}

test("buildClearingReport aggregates orders, money and in-range working days", () => {
  const built = report.buildClearingReport({
    kind: "payables",
    accounts: [account()],
    stats: new Map([["a1", stats()]]),
    range: { from: "2026-11-01", to: "2026-11-30" },
    periodLabel: "نوفمبر",
    generatedAt: "2026-11-30 12:00",
  });

  assert.equal(built.rows[0].orderCount, 4);
  assert.equal(built.rows[0].workingDays, 2);
  assert.equal(built.rows[0].debit, 100);
  assert.equal(built.rows[0].credit, 250.5);
  assert.equal(built.rows[0].net, -150.5);
  assert.deepEqual(built.totals, {
    orders: 4,
    workingDays: 2,
    debit: 100,
    credit: 250.5,
    net: 150.5,
  });
});

test("merchants have no working-day count", () => {
  const built = report.buildClearingReport({
    kind: "collections",
    accounts: [
      account({
        accountId: "m1",
        partyType: "merchant",
        partyId: "KJ-1",
        partyName: "مطعم",
        balance: 900,
      }),
    ],
    stats: new Map([["m1", stats({ orderCount: 6, debitMinor: 90_000, creditMinor: 0 })]]),
    range: { from: null, to: null },
    periodLabel: "كل الفترات",
    generatedAt: "2026-11-30 12:00",
  });

  assert.equal(built.rows[0].workingDays, null);
  assert.equal(built.rows[0].orderCount, 6);
  assert.equal(built.totals.workingDays, 0);
  assert.equal(built.totals.orders, 6);
  assert.equal(built.title, "كشف إجمالي التحصيلات المعتمدة");
});

test("missing stats yield zero money but keep the account row", () => {
  const built = report.buildClearingReport({
    kind: "payables",
    accounts: [account({ accountId: "a2" })],
    stats: new Map(),
    range: { from: null, to: null },
    periodLabel: "كل الفترات",
    generatedAt: "2026-11-30 12:00",
  });

  assert.equal(built.rows[0].orderCount, 0);
  assert.equal(built.rows[0].debit, 0);
  assert.equal(built.rows[0].credit, 0);
});

test("excludeInternal drops ZEMBAWY from export rows and summary totals", () => {
  const accounts = [
    account({
      accountId: "zem",
      partyId: "ZEMBAWY",
      partyName: "ZEMBAWY",
      isInternalStaff: true,
      balance: -826.5,
    }),
    account({
      accountId: "yusuf",
      partyId: "yusuf",
      partyName: "يوسف علي",
      balance: -4272.7,
    }),
  ];
  const statsMap = new Map([
    ["zem", stats({ orderCount: 2, debitMinor: 0, creditMinor: 82_650 })],
    ["yusuf", stats({ orderCount: 3, debitMinor: 0, creditMinor: 427_270 })],
  ]);

  const included = report.selectClearingReportAccounts({
    accounts,
    kind: "payables",
    range: { from: null, to: null },
    excludeInternal: false,
  });
  assert.equal(included.length, 2);

  const excluded = report.selectClearingReportAccounts({
    accounts,
    kind: "payables",
    range: { from: null, to: null },
    excludeInternal: true,
  });
  assert.deepEqual(
    excluded.map((row) => row.partyName),
    ["يوسف علي"],
  );

  const built = report.buildClearingReport({
    kind: "payables",
    accounts: excluded,
    stats: statsMap,
    range: { from: null, to: null },
    periodLabel: "كل الفترات",
    generatedAt: "2026-11-30 12:00",
  });

  assert.ok(!built.rows.some((row) => row.partyName === "ZEMBAWY"));
  assert.equal(built.totals.orders, 3);
  assert.equal(built.totals.credit, 4272.7);
  assert.equal(built.totals.net, 4272.7);
  assert.deepEqual(report.clearingReportTotals(built.rows), built.totals);
});

test("excludeInternal keeps merchants and only drops internal couriers", () => {
  const accounts = [
    account({
      accountId: "m1",
      partyType: "merchant",
      partyName: "تاجر",
      balance: 900,
    }),
    account({
      accountId: "zem",
      partyName: "ZEMBAWY",
      isInternalStaff: true,
      balance: -500,
    }),
  ];

  const scoped = report.selectClearingReportAccounts({
    accounts,
    kind: "collections",
    range: { from: null, to: null },
    excludeInternal: true,
  });

  assert.deepEqual(
    scoped.map((row) => row.partyName),
    ["تاجر"],
  );
});

test("ZEMBAWY is excluded by name when the ledger flag is missing", () => {
  const accounts = [
    account({
      accountId: "zem",
      partyName: "zembawy",
      isInternalStaff: false,
      balance: -826.5,
    }),
    account({
      accountId: "zem-upper",
      partyName: "  ZEMBAWY  ",
      isInternalStaff: undefined,
      balance: -10,
    }),
    account({
      accountId: "yusuf",
      partyName: "يوسف علي",
      balance: -100,
    }),
  ];

  const scoped = report.selectClearingReportAccounts({
    accounts,
    kind: "payables",
    range: { from: null, to: null },
    excludeInternal: true,
  });

  assert.deepEqual(
    scoped.map((row) => row.accountId),
    ["yusuf"],
  );
});

test("a merchant whose name contains ZEMBAWY is never treated as internal", () => {
  const accounts = [
    account({
      accountId: "merchant-zem",
      partyType: "merchant",
      partyName: "ZEMBAWY market",
      isInternalStaff: true,
      balance: 900,
    }),
  ];

  const scoped = report.selectClearingReportAccounts({
    accounts,
    kind: "collections",
    range: { from: null, to: null },
    excludeInternal: true,
  });

  assert.deepEqual(
    scoped.map((row) => row.accountId),
    ["merchant-zem"],
  );
});
