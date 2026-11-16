/**
 * Pure commission-rate resolution for the contract register.
 *
 * A contract's headline rate can come from three places: the structured
 * commission section saved by the draft editor, the merchant's negotiated
 * agreement, or the merchant's target rate. The register shows the same figure
 * the books will charge, so the first finite value wins and a missing rate is
 * rendered as a dash rather than a misleading 0%.
 */

function finite(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

export function resolveContractCommissionRate(
  baseRate: number | null | undefined,
  agreedCommission: number | null | undefined,
  targetCommission: number | null | undefined,
): number | null {
  return (
    finite(baseRate) ??
    finite(agreedCommission) ??
    finite(targetCommission) ??
    null
  );
}
