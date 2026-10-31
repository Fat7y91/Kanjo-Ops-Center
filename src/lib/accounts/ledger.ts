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

  return {
    account,
    deposits,
    expenses,
    balance: deposits - expenses,
    entryCount,
  };
}

export type LedgerTotals = {
  deposits: number;
  expenses: number;
  balance: number;
};

/** Totals per currency, because bank ledgers must never mix denominations. */
export function totalByCurrency(
  accounts: readonly BankAccount[],
  entries: readonly LedgerEntry[],
): Record<"EGP" | "SAR", LedgerTotals> {
  const totals: Record<"EGP" | "SAR", LedgerTotals> = {
    EGP: { deposits: 0, expenses: 0, balance: 0 },
    SAR: { deposits: 0, expenses: 0, balance: 0 },
  };

  for (const entry of entries) {
    const bucket = totals[entry.currency];
    if (entry.kind === "deposit") bucket.deposits += entry.amount;
    else bucket.expenses += entry.amount;
  }

  totals.EGP.balance = totals.EGP.deposits - totals.EGP.expenses;
  totals.SAR.balance = totals.SAR.deposits - totals.SAR.expenses;
  return totals;
}

export function summarizeAll(
  accounts: readonly BankAccount[],
  entries: readonly LedgerEntry[],
): AccountSummary[] {
  return accounts.map((account) => summarizeAccount(account, entries));
}
