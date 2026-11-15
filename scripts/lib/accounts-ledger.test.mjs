import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { summarizeAccount, summarizeAll, totalByCurrency } = loadTsModule(
  path.join(projectRoot, "src/lib/accounts/ledger.ts"),
);

const sarAccount = {
  id: "acct-sar",
  bankName: "البنك السعودي",
  accountName: "بنك الرياض",
  accountNumber: "1000-SAR",
  iban: "",
  country: "SA",
  currency: "SAR",
  cityId: null,
  active: true,
  createdAt: "",
  ledgerBalance: 4659.94,
};

function entry(overrides) {
  return {
    id: "line-1",
    entryId: "",
    accountId: "acct-sar",
    kind: "deposit",
    label: "إيداع رأسمالي",
    counterparty: "رأس المال",
    amount: 52500,
    currency: "SAR",
    occurredAt: "2026-01-05",
    recordedBy: "",
    recordedAt: "2026-01-05",
    ...overrides,
  };
}

test("migrated SAR deposits and expenses are summed exactly in minor units", () => {
  const summary = summarizeAccount(sarAccount, [
    entry({ id: "d1", amount: 52500 }),
    entry({ id: "e1", kind: "expense", amount: 47840.06, label: "مصروف" }),
  ]);

  assert.equal(summary.deposits, 52500);
  assert.equal(summary.expenses, 47840.06);
  assert.equal(Math.round((summary.deposits - summary.expenses) * 100) / 100, 4659.94);
  assert.equal(summary.balance, 4659.94);
  assert.equal(summary.entryCount, 2);
});

test("the statement closing balance wins over a re-summed page", () => {
  const summary = summarizeAccount(sarAccount, [entry({ amount: 100 })]);

  assert.equal(summary.deposits, 100);
  assert.equal(summary.balance, 4659.94);
});

test("currency totals keep EGP and SAR apart and reconcile to the cards", () => {
  const egpAccount = {
    ...sarAccount,
    id: "acct-egp",
    accountNumber: "1000",
    country: "EG",
    currency: "EGP",
    ledgerBalance: 0,
  };
  const summaries = summarizeAll(
    [egpAccount, sarAccount],
    [
      entry({ id: "d1", amount: 52500 }),
      entry({ id: "e1", kind: "expense", amount: 47840.06, label: "مصروف" }),
    ],
  );

  const totals = totalByCurrency(summaries);
  assert.deepEqual(totals.EGP, { deposits: 0, expenses: 0, balance: 0 });
  assert.deepEqual(totals.SAR, {
    deposits: 52500,
    expenses: 47840.06,
    balance: 4659.94,
  });
});
