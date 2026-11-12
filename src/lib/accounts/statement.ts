import type { AccountSummary } from "./ledger";
import type { LedgerEntry } from "./types";

/**
 * Bank-statement shaping for one treasury account.
 *
 * A statement is not a list of amounts: it reconciles. The opening balance is
 * derived from the authoritative closing balance and the movements shown, so
 * `opening + in − out` always lands exactly on the balance the card displays.
 * The view figure stays the source of truth; the statement only distributes it
 * across the rows the operator asked to read.
 */

export type StatementLine = {
  id: string;
  entryId: string;
  date: string;
  /** Why the money moved (the journal memo). */
  reference: string;
  /** The other side of the entry: where it came from or where it went. */
  counterparty: string;
  /** Money in, in major units. Zero when the row is an outgoing movement. */
  in: number;
  /** Money out, in major units. Zero when the row is an incoming movement. */
  out: number;
  /** Running balance after this row, in major units. */
  running: number;
};

export type AccountStatement = {
  accountName: string;
  accountNumber: string;
  currency: "EGP" | "SAR";
  opening: number;
  totalIn: number;
  totalOut: number;
  closing: number;
  lines: StatementLine[];
};

/**
 * Builds the statement oldest-first.
 *
 * `summary.balance` is the journal-derived balance read from
 * `journal_account_balances`, so the closing figure is authoritative. Opening
 * is whichever figure makes the listed movements reconcile, which is the
 * account's true opening balance when the movement page is complete.
 */
export function buildStatement(
  summary: AccountSummary,
  entries: readonly LedgerEntry[],
): AccountStatement {
  const ordered = entries
    .filter((entry) => entry.accountId === summary.account.id)
    .slice()
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  const totalIn = ordered
    .filter((entry) => entry.kind === "deposit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalOut = ordered
    .filter((entry) => entry.kind === "expense")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const closing = round2(summary.balance);
  const opening = round2(closing - totalIn + totalOut);

  let running = opening;
  const lines = ordered.map((entry) => {
    const moneyIn = entry.kind === "deposit" ? entry.amount : 0;
    const moneyOut = entry.kind === "expense" ? entry.amount : 0;
    running = round2(running + moneyIn - moneyOut);
    return {
      id: entry.id,
      entryId: entry.entryId,
      date: entry.occurredAt,
      reference: entry.label,
      counterparty: entry.counterparty,
      in: moneyIn,
      out: moneyOut,
      running,
    };
  });

  return {
    accountName: summary.account.bankName,
    accountNumber: summary.account.accountNumber,
    currency: summary.account.currency,
    opening,
    totalIn: round2(totalIn),
    totalOut: round2(totalOut),
    closing,
    lines,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
