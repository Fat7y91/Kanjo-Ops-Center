import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const view = loadTsModule(
  path.join(projectRoot, "src/lib/operations/clearinghouse-view.ts"),
);
const exp = loadTsModule(
  path.join(projectRoot, "src/lib/operations/clearinghouse-export.ts"),
);

const NOW = new Date("2026-11-21T12:00:00.000Z");

function account(overrides) {
  return {
    accountId: "a",
    partyType: "merchant",
    partyId: "p",
    partyName: "طرف",
    currency: "EGP",
    balance: 100,
    lastActivityAt: null,
    lastSettlementAt: null,
    workingDates: [],
    ...overrides,
  };
}

test("presets resolve to inclusive UTC day windows", () => {
  assert.deepEqual(
    view.resolveClearingRange({ period: "today", from: "", to: "" }, NOW),
    { from: "2026-11-21", to: "2026-11-21" },
  );
  assert.deepEqual(
    view.resolveClearingRange({ period: "7d", from: "", to: "" }, NOW),
    { from: "2026-11-15", to: "2026-11-21" },
  );
  assert.deepEqual(
    view.resolveClearingRange({ period: "month", from: "", to: "" }, NOW),
    { from: "2026-11-01", to: "2026-11-21" },
  );
  assert.deepEqual(
    view.resolveClearingRange({ period: "all", from: "", to: "" }, NOW),
    { from: null, to: null },
  );
  assert.deepEqual(
    view.resolveClearingRange(
      { period: "custom", from: "2026-11-10", to: "2026-11-12" },
      NOW,
    ),
    { from: "2026-11-10", to: "2026-11-12" },
  );
});

test("a period keeps only accounts active in the window", () => {
  const range = view.resolveClearingRange({ period: "7d", from: "", to: "" }, NOW);
  const rows = [
    account({ accountId: "recent", lastActivityAt: "2026-11-20" }),
    account({ accountId: "old", lastActivityAt: "2026-10-01" }),
    account({
      accountId: "courier-day",
      partyType: "courier",
      lastActivityAt: "2026-10-01",
      workingDates: ["2026-11-18"],
    }),
  ];
  const kept = view.filterClearingAccounts(rows, range).map((row) => row.accountId);
  assert.deepEqual(kept, ["recent", "courier-day"]);
});

test("all-range keeps every account", () => {
  const rows = [account({ accountId: "x" }), account({ accountId: "y" })];
  assert.equal(
    view.filterClearingAccounts(rows, { from: null, to: null }).length,
    2,
  );
});

test("sorts by recency, unsettled age and amount", () => {
  const rows = [
    account({ accountId: "mid", balance: -50, lastActivityAt: "2026-11-10", lastSettlementAt: "2026-11-01" }),
    account({ accountId: "new", balance: 10, lastActivityAt: "2026-11-20", lastSettlementAt: null }),
    account({ accountId: "old", balance: 500, lastActivityAt: "2026-11-02", lastSettlementAt: "2026-10-01" }),
  ];
  assert.deepEqual(
    view.sortClearingAccounts(rows, "recent").map((row) => row.accountId),
    ["new", "mid", "old"],
  );
  // The never-settled account comes first, then the oldest settlement date.
  assert.deepEqual(
    view.sortClearingAccounts(rows, "oldest_unsettled").map((row) => row.accountId),
    ["new", "old", "mid"],
  );
  assert.deepEqual(
    view.sortClearingAccounts(rows, "amount_desc").map((row) => row.accountId),
    ["old", "mid", "new"],
  );
  assert.deepEqual(
    view.sortClearingAccounts(rows, "amount_asc").map((row) => row.accountId),
    ["new", "mid", "old"],
  );
});

test("working days count only dates inside the window", () => {
  const range = view.resolveClearingRange({ period: "7d", from: "", to: "" }, NOW);
  const courier = account({
    partyType: "courier",
    workingDates: ["2026-11-15", "2026-11-18", "2026-11-21", "2026-11-10"],
  });
  assert.equal(view.clearingWorkingDays(courier, range), 3);
});

test("the workbook has a summary plus one sheet per side", () => {
  const range = { from: null, to: null };
  const sheets = exp.buildClearingSheets({
    periodLabel: "كل الفترات",
    generatedAt: "2026-11-21 12:00",
    range,
    totals: { receivables: 463.26, payables: 1940, net: -1476.74 },
    receivables: [account({ accountId: "r1", balance: 463.26 })],
    payables: [
      account({ accountId: "p1", balance: -1940, partyType: "courier", workingDates: ["2026-11-20", "2026-11-21"] }),
    ],
  });
  assert.deepEqual(
    sheets.map((sheet) => sheet.name),
    ["الملخص", "مستحق لنا", "مستحق لهم"],
  );
  assert.equal(sheets[2].rows[0]["أيام العمل"], 2);
  assert.equal(sheets[2].rows[0]["المبلغ"], 1940);
});
