import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { buildStatement } = loadTsModule(
  path.join(projectRoot, "src/lib/accounts/statement.ts"),
);

/**
 * The bank statement must reconcile by construction. These tests pin the
 * opening/closing arithmetic and the running balance the operator reads, so the
 * printed statement can never disagree with the treasury card.
 */

const account = {
  id: "acct-1000",
  bankName: "البنك المصري",
  accountName: "البنك",
  accountNumber: "1000",
  iban: "",
  country: "EG",
  currency: "EGP",
  cityId: null,
  active: true,
  createdAt: "",
  ledgerBalance: 1500,
};

function entry(overrides) {
  return {
    id: "line-1",
    entryId: "entry-1",
    accountId: "acct-1000",
    kind: "deposit",
    label: "تحصيل",
    counterparty: "تاجر أ",
    amount: 100,
    currency: "EGP",
    occurredAt: "2026-11-01",
    recordedBy: "",
    recordedAt: "",
    ...overrides,
  };
}

test("opening balance makes the listed movements reconcile to closing", () => {
  const statement = buildStatement(
    { account, deposits: 700, expenses: 200, balance: 1500, entryCount: 3 },
    [
      entry({ id: "a", amount: 500, occurredAt: "2026-11-01" }),
      entry({
        id: "b",
        kind: "expense",
        amount: 200,
        occurredAt: "2026-11-02",
      }),
      entry({ id: "c", amount: 200, occurredAt: "2026-11-03" }),
    ],
  );

  assert.equal(statement.totalIn, 700);
  assert.equal(statement.totalOut, 200);
  assert.equal(statement.closing, 1500);
  assert.equal(statement.opening, 1000);
  assert.equal(statement.lines.at(-1).running, 1500);
});

test("rows are ordered oldest-first with a running balance", () => {
  const statement = buildStatement(
    { account, deposits: 0, expenses: 0, balance: 300, entryCount: 2 },
    [
      entry({ id: "later", amount: 200, occurredAt: "2026-11-05" }),
      entry({ id: "earlier", amount: 100, occurredAt: "2026-11-01" }),
    ],
  );

  assert.deepEqual(
    statement.lines.map((line) => line.id),
    ["earlier", "later"],
  );
  assert.equal(statement.lines[0].running, 100);
  assert.equal(statement.lines[1].running, 300);
});

test("an incoming row fills in and an outgoing row fills out, never both", () => {
  const statement = buildStatement(
    { account, deposits: 0, expenses: 0, balance: -50, entryCount: 1 },
    [entry({ kind: "expense", amount: 50, occurredAt: "2026-11-01" })],
  );

  assert.equal(statement.lines[0].in, 0);
  assert.equal(statement.lines[0].out, 50);
  assert.equal(statement.opening, 0);
  assert.equal(statement.lines[0].running, -50);
});

test("entries on other accounts are ignored", () => {
  const statement = buildStatement(
    { account, deposits: 0, expenses: 0, balance: 100, entryCount: 0 },
    [entry({ accountId: "acct-sar" })],
  );

  assert.equal(statement.lines.length, 0);
  assert.equal(statement.opening, 100);
  assert.equal(statement.closing, 100);
});

test("money is rounded to two decimals", () => {
  const statement = buildStatement(
    { account, deposits: 0, expenses: 0, balance: 0.3, entryCount: 1 },
    [entry({ amount: 0.1, occurredAt: "2026-11-01" })],
  );

  assert.equal(statement.lines[0].running, 0.3);
  assert.equal(statement.opening, 0.2);
});
