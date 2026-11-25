export const ADJUSTMENT_DIRECTIONS = ["credit", "debit"] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export type AdjustmentPartyType = "merchant" | "courier";

export type AdjustmentPlanLine = {
  code: string;
  side: "debit" | "credit";
  amountMinor: number;
};

/**
 * Double-entry shape for a manual bonus or deduction.
 *
 * Credit (bonus): expense is debited and the party payable is credited.
 * Debit (deduction): the party is debited and operational income is credited.
 */
export function buildManualAdjustmentPlan(
  partyType: AdjustmentPartyType,
  direction: AdjustmentDirection,
  amountMinor: number,
): AdjustmentPlanLine[] {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("ADJUSTMENT_AMOUNT_INVALID");
  }

  if (direction === "credit") {
    return [
      {
        code: partyType === "courier" ? "5110" : "5210",
        side: "debit",
        amountMinor,
      },
      { code: "party", side: "credit", amountMinor },
    ];
  }

  return [
    { code: "party", side: "debit", amountMinor },
    { code: "4900", side: "credit", amountMinor },
  ];
}

export function isAdjustmentBalanced(
  lines: readonly AdjustmentPlanLine[],
): boolean {
  const debit = lines
    .filter((line) => line.side === "debit")
    .reduce((sum, line) => sum + line.amountMinor, 0);
  const credit = lines
    .filter((line) => line.side === "credit")
    .reduce((sum, line) => sum + line.amountMinor, 0);
  return debit > 0 && debit === credit;
}

const ACCOUNT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdjustmentAccountRef =
  | { kind: "account"; accountId: string }
  | { kind: "party"; partyType: AdjustmentPartyType; partyId: string };

/**
 * Accepts either a ledger account UUID or a prefixed party reference
 * (`courier:<id>` / `merchant:<id>`). Returns null for anything else so the
 * route can answer a clear 422 instead of letting Postgres reject a bad UUID.
 */
export function parseAdjustmentAccountRef(
  raw: unknown,
): AdjustmentAccountRef | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value === "") return null;

  const prefixed = /^(courier|merchant)\s*:\s*(.+)$/i.exec(value);
  if (prefixed) {
    const partyId = prefixed[2].trim();
    if (partyId === "") return null;
    return {
      kind: "party",
      partyType: prefixed[1].toLowerCase() as AdjustmentPartyType,
      partyId,
    };
  }

  return ACCOUNT_UUID.test(value)
    ? { kind: "account", accountId: value }
    : null;
}

/**
 * Normalizes the adjustment payload before validation.
 *
 * The modal posts `entryDate`; integration callers may send `businessDate`.
 * Both resolve to the same validated field, and unknown shapes become an empty
 * object so zod produces the Arabic validation message.
 */
export function normalizeManualAdjustmentPayload(
  raw: unknown,
): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  return {
    direction: source.direction,
    amount: source.amount,
    entryDate: source.entryDate ?? source.businessDate,
    reason: source.reason,
  };
}
