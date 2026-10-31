import { listBankAccounts, listLedgerEntries } from "@/lib/accounts/store";
import { totalByCurrency } from "@/lib/accounts/ledger";
import { buildPayslips } from "@/lib/payroll/store";

export type AccountsSnapshot = {
  currency: "EGP" | "SAR";
  deposits: number;
  expenses: number;
  balance: number;
};

export type PendingObligation = {
  currency: "EGP" | "SAR";
  amount: number;
};

export type FounderFinancials = {
  accounts: AccountsSnapshot[];
  /**
   * Payroll owed for the current period that has not yet left the bank. Derived
   * from the same payslips the payroll page renders, so the two screens cannot
   * disagree. A currency with no payroll stays at zero rather than being
   * silently omitted.
   */
  pending: PendingObligation[];
};

/**
 * Server-derived treasury position.
 *
 * Built on the server and passed down as props so the dashboard can never show
 * a different balance than the accounts page: both read the same ledger. Each
 * currency is reported separately because riyals and pounds must never be
 * summed together.
 */
export function buildFounderFinancials(): FounderFinancials {
  const totals = totalByCurrency(listBankAccounts(), listLedgerEntries());

  const pending: Record<"EGP" | "SAR", number> = { EGP: 0, SAR: 0 };
  for (const slip of buildPayslips()) {
    pending[slip.profile.currency] += slip.result.net;
  }

  return {
    accounts: (["SAR", "EGP"] as const).map((currency) => ({
      currency,
      deposits: totals[currency].deposits,
      expenses: totals[currency].expenses,
      balance: totals[currency].balance,
    })),
    pending: (["SAR", "EGP"] as const).map((currency) => ({
      currency,
      amount: Math.round(pending[currency] * 100) / 100,
    })),
  };
}
