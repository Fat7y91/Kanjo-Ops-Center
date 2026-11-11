import type { BankAccount, LedgerEntry } from "./types";

export type AccountSummary = {
  account: BankAccount;
  deposits: number;
  expenses: number;
  balance: number;
  entryCount: number;
};

/**
 * Balance is derived, never stored: ΣDeposits − ΣExpenses over the immutable
 * ledger. Every screen reads this function, so the figure can never drift from
 * the entries that produced it.
 *
 * When the account carries a `ledgerBalance` freshly read from
 * `app.journal_account_balances`, that view figure is authoritative: it is the
 * whole journal for the account, not the capped page of movements fetched for
 * the card. The header numbers therefore always equal the double-entry book.
 */
export function summarizeAccount(
  account: BankAccount,
  entries: readonly LedgerEntry[],
): AccountSummary {
  let deposits = 0;
  let expenses = 0;
  let entryCount = 0;

  for (const entry of entries) {
    if (entry.accountId !== account.id) continue;
    entryCount += 1;
    if (entry.kind === "deposit") deposits += entry.amount;
    else expenses += entry.amount;
  }

  const balance =
    account.ledgerBalance === null ? deposits - expenses : account.ledgerBalance;

  return {
    account,
    deposits,
    expenses,
    balance,
    entryCount,
  };
}

export type LedgerTotals = {
  deposits: number;
  expenses: number;
  balance: number;
};

/**
 * Totals per currency across the bank accounts.
 *
 * The balance is the sum of each account's authoritative `balance` (which the
 * view supplies), so the header can never disagree with the cards beneath it.
 * Only EGP and SAR bank accounts are in scope — cash accounts are not part of
 * the treasury dashboard.
 */
export function totalByCurrency(
  summaries: readonly AccountSummary[],
): Record<"EGP" | "SAR", LedgerTotals> {
  const totals: Record<"EGP" | "SAR", LedgerTotals> = {
    EGP: { deposits: 0, expenses: 0, balance: 0 },
    SAR: { deposits: 0, expenses: 0, balance: 0 },
  };

  for (const summary of summaries) {
    const bucket = totals[summary.account.currency];
    bucket.deposits += summary.deposits;
    bucket.expenses += summary.expenses;
    bucket.balance += summary.balance;
  }

  return totals;
}

export function summarizeAll(
  accounts: readonly BankAccount[],
  entries: readonly LedgerEntry[],
): AccountSummary[] {
  return accounts.map((account) => summarizeAccount(account, entries));
}
