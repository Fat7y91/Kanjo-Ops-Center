import type { StatementRange } from "./types";

/**
 * Pure statement metrics shared by the modal, the Excel export and the tests.
 *
 * An order is counted once even when its journal entry touches the party more
 * than once. Only `operation` lines qualify, so attendance, settlements and
 * manual adjustments never inflate the delivered-order count.
 */

export type StatementOrderLine = {
  sourceType: string;
  sourceId?: string | null;
  orderNumber?: string | null;
};

export type StatementAmountLine = {
  debit: number;
  credit: number;
};

export function countStatementOrders(
  lines: readonly StatementOrderLine[],
): number {
  const orders = new Set<string>();
  for (const line of lines) {
    if (line.sourceType !== "operation") continue;
    const key = line.orderNumber?.trim() || line.sourceId?.trim() || "";
    if (key !== "") orders.add(key);
  }
  return orders.size;
}

export function statementTotals(lines: readonly StatementAmountLine[]): {
  debit: number;
  credit: number;
} {
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    debit += line.debit;
    credit += line.credit;
  }
  return { debit: round2(debit), credit: round2(credit) };
}

export function statementDay(value: string): string {
  return value.slice(0, 10);
}

export function withinStatementRange(
  day: string,
  range: StatementRange | null | undefined,
): boolean {
  if (!range) return true;
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
