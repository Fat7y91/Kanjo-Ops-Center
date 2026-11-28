import type { ClearingPartyType, PartyStatementLine } from "./types";

/**
 * Pure construction of a party statement's display lines.
 *
 * Kept apart from the Supabase read so the courier-enrichment rule is unit
 * testable: on a merchant statement every order line names the courier who
 * delivered it, resolved from the roster and falling back to a name snapshotted
 * on the operation row. A missing courier leaves the tag off rather than
 * printing a placeholder.
 */

/** The operation facts a statement line needs to describe an order. */
export type StatementOperationFact = {
  orderNumber: string;
  occurredAt: string;
  orderValueMinor: number;
  commissionPercent: number | null;
  courierId: string | null;
  /** Courier name snapshotted on the operation row, when the schema has one. */
  courierName: string | null;
};

/** A journal line as the statement repository returns it. */
export type StatementJournalRow = {
  id: string;
  entryId: string;
  date: string;
  reference: string;
  memo: string;
  debitMinor: number;
  creditMinor: number;
  sourceType: string;
  sourceId: string | null;
};

function resolveCourierName(
  partyType: ClearingPartyType,
  fact: StatementOperationFact | undefined,
  courierNames: ReadonlyMap<string, string>,
): string | null {
  // Only a merchant statement shows the courier: on a courier's own statement
  // the courier is the account owner, so the tag would be redundant noise.
  if (partyType !== "merchant" || !fact) return null;

  const resolved = fact.courierId
    ? courierNames.get(fact.courierId)?.trim()
    : "";
  return resolved || fact.courierName?.trim() || null;
}

export function buildPartyStatementLines(args: {
  rows: readonly StatementJournalRow[];
  facts: ReadonlyMap<string, StatementOperationFact>;
  courierNames: ReadonlyMap<string, string>;
  partyType: ClearingPartyType;
  openingMinor: number;
}): PartyStatementLine[] {
  let runningMinor = args.openingMinor;

  return args.rows.map((row) => {
    runningMinor += row.debitMinor - row.creditMinor;
    const fact =
      row.sourceType === "operation" && row.sourceId
        ? args.facts.get(row.sourceId)
        : undefined;

    return {
      id: row.id,
      entryId: row.entryId,
      date: row.date,
      reference: row.reference,
      memo: row.memo,
      debit: Math.round(row.debitMinor) / 100,
      credit: Math.round(row.creditMinor) / 100,
      running: Math.round(runningMinor) / 100,
      orderNumber: fact?.orderNumber,
      occurredAt: fact?.occurredAt,
      orderValue:
        fact && Number.isFinite(fact.orderValueMinor)
          ? Math.round(fact.orderValueMinor) / 100
          : undefined,
      commissionPercent: fact?.commissionPercent ?? undefined,
      courierName: resolveCourierName(args.partyType, fact, args.courierNames),
    };
  });
}
