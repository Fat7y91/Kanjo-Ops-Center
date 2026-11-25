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
