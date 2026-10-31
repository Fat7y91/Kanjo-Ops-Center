import type { ActiveSession } from "@/lib/rbac/types";

import type { BankAccount, LedgerEntry } from "./types";

/**
 * Treasury access tiers.
 *
 * Treasury is not one audience. Founders, System Admins and the Head of
 * Accounts run the books: every account in every country, every movement, the
 * derived balance and the expense total. City Managers have a single narrow
 * job — moving cash into the Egyptian accounts they cover — and must never see
 * a running balance or what the company spends.
 *
 * The tier is derived from capabilities, never from a job title, so revoking a
 * grant immediately narrows both the UI and the API.
 */
export type TreasuryAccess = {
  /** Sees every account, every entry, balances and expense totals. */
  full: boolean;
  /** May append entries, but deposits only. */
  canRecordDeposits: boolean;
  /** May append expenses. Implies full. */
  canRecordExpenses: boolean;
  /** May open the treasury module at all. */
  canView: boolean;
};

export function resolveTreasuryAccess(
  session: Pick<ActiveSession, "permissions">,
): TreasuryAccess {
  const held = new Set(session.permissions);
  // Capability, not clearance, decides the tier. A Head of Accounts can sit at
  // any clearance level; what matters is that they were granted the book.
  const full = held.has("manage_accounts") || held.has("view_accounts");

  return {
    full,
    canView: full || held.has("record_deposits"),
    canRecordDeposits: full || held.has("record_deposits"),
    canRecordExpenses: full,
  };
}

/**
 * Accounts visible to this viewer.
 *
 * A full viewer sees the whole company. A deposit-only viewer is limited to
 * Egyptian accounts, because that is the only remit the capability grants: the
 * Saudi account is funded centrally and is never a city manager's to touch.
 */
export function visibleAccounts(
  accounts: readonly BankAccount[],
  access: TreasuryAccess,
): BankAccount[] {
  if (access.full) return [...accounts];
  if (!access.canView) return [];
  return accounts.filter((account) => account.country === "EG");
}

/**
 * Restrict the ledger to entries the viewer is allowed to see.
 *
 * A deposit-only viewer sees deposit rows only. Even that is generous — the
 * page never renders the running balance — but it keeps the API honest: a
 * crafted request cannot pull the expense history.
 */
export function visibleEntries(
  entries: readonly LedgerEntry[],
  access: TreasuryAccess,
): LedgerEntry[] {
  if (access.full) return [...entries];
  if (!access.canView) return [];
  return entries.filter((entry) => entry.kind === "deposit");
}

/** Throws the error code an API caller receives when a write is out of tier. */
export function assertCanRecord(
  access: TreasuryAccess,
  kind: LedgerEntry["kind"],
  account: BankAccount,
): string | null {
  if (kind === "expense" && !access.canRecordExpenses) {
    return "لا تملك صلاحية تسجيل المصروفات.";
  }
  if (kind === "deposit" && !access.canRecordDeposits) {
    return "لا تملك صلاحية تسجيل الإيداعات.";
  }
  if (!access.full && account.country !== "EG") {
    return "لا تملك صلاحية العمل على هذا الحساب.";
  }
  return null;
}
