/**
 * Pure display helpers for the merchant directory's money columns.
 *
 * Split from `merchant-rows.ts` (which reaches the stores) so the signed-net
 * classification and the rate formatting can be unit-tested without a database.
 * Nothing here formats currency: the row builder owns the locale-aware
 * formatter and this module owns the decisions.
 */

export type MerchantBalanceTone =
  | "due_to_house"
  | "due_to_merchant"
  | "settled";

/**
 * Classifies a signed net position against Kanjo.
 *
 * The journal reports `debit − credit`, so a positive merchant figure is money
 * the merchant owes Kanjo, and a negative figure is money Kanjo owes them.
 */
export function merchantBalanceTone(net: number): MerchantBalanceTone {
  if (net > 0) return "due_to_house";
  if (net < 0) return "due_to_merchant";
  return "settled";
}

/**
 * The agreed commission rate as a display string.
 *
 * Null means the contract has not been signed yet, so the directory shows a
 * dash rather than a misleading 0%. The percentage sign is the Arabic one
 * (٪) to match the RTL surface.
 */
export function commissionRateLabel(
  rate: number | null | undefined,
  format: (value: number) => string,
): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${format(rate)}٪`;
}

/**
 * The commission rate actually in force for a merchant.
 *
 * The posting trigger charges `coalesce(agreed_commission, target_commission)`,
 * so the directory must show the same figure the books will use — a signed
 * agreement wins, and an unsigned contract falls back to its target rate. Echoing
 * only `agreed_commission` would show a dash for a merchant that is in fact
 * charged.
 */
export function effectiveCommissionRate(
  agreed: number | null | undefined,
  target: number | null | undefined,
): number | null {
  if (agreed != null && Number.isFinite(agreed)) return agreed;
  if (target != null && Number.isFinite(target)) return target;
  return null;
}
