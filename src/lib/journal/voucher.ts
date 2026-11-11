import type { JournalEntryDetail, JournalLineDetail } from "./types";

/**
 * Pure shaping of a journal voucher for display.
 *
 * Kept apart from the React component so the audit rules — which party is
 * involved, which side is which, what the voucher amount is — are unit-testable
 * without a DOM.
 */

export type VoucherSides = {
  debits: JournalLineDetail[];
  credits: JournalLineDetail[];
};

/** The two sides of the entry, in account-code order within each side. */
export function splitSides(lines: readonly JournalLineDetail[]): VoucherSides {
  return {
    debits: lines.filter((line) => line.side === "debit"),
    credits: lines.filter((line) => line.side === "credit"),
  };
}

/**
 * The voucher amount.
 *
 * A balanced entry has equal debit and credit totals, so either side is the
 * figure that moved. Taking the max keeps the display honest even if a
 * malformed entry (which the deferred trigger should have rejected) is read.
 */
export function voucherAmount(voucher: JournalEntryDetail): number {
  return Math.max(voucher.debitTotal, voucher.creditTotal);
}

/** Resolved merchant and courier names attached to the entry, deduplicated. */
export function voucherParties(voucher: JournalEntryDetail): string[] {
  return [...new Set([...voucher.parties.merchants, ...voucher.parties.couriers])];
}

/**
 * Human labels for the two bank control accounts.
 *
 * The chart of accounts names them tersely (`البنك`, `بنك الرياض`); every money
 * screen presents them as the Egyptian and Saudi bank, so a voucher names them
 * the same way for consistency.
 */
const BANK_LABELS: Record<string, string> = {
  "1000": "البنك المصري",
  "1000-SAR": "البنك السعودي",
};

/**
 * The human label for a line: the resolved party name when the line is a party
 * sub-account, a friendly bank name for a bank control account, otherwise the
 * account name (e.g. "مصروف أرباح المناديب").
 */
export function lineLabel(line: JournalLineDetail): string {
  const party = line.partyName?.trim();
  if (party) return party;
  return BANK_LABELS[line.code] ?? line.name;
}
