import { COURIER_DAILY_BASE_MINOR } from "@/lib/couriers/tiered-pay";

/**
 * Pure COD settlement arithmetic.
 *
 * Mirrors `app.insert_cod_settlement_lines`. In a COD order the courier pays the
 * merchant the full subtotal in cash at pickup, so:
 *   - the merchant already holds the goods' value and owes only the platform
 *     commission;
 *   - the courier's net claim is `(subtotal − collected) + fee + tip`;
 *   - the fixed daily attendance amount is owed once per attended Cairo day.
 *
 * Money is in minor units (piastres). Signed values are never clamped: a
 * negative courier net means the courier owes Kanjo.
 */

export { COURIER_DAILY_BASE_MINOR };

/** Merchant commission (receivable) for one order. */
export function merchantCommissionMinor(
  subtotalMinor: number,
  ratePercent: number,
): number {
  return Math.round((subtotalMinor * ratePercent) / 100);
}

export type CourierOrderTerms = {
  subtotalMinor: number;
  codCollectedMinor: number;
  courierFeeMinor: number;
  tipMinor?: number;
};

/** Courier's net claim for one order. Positive = Kanjo owes the courier. */
export function courierOrderNetMinor(terms: CourierOrderTerms): number {
  return (
    terms.subtotalMinor -
    terms.codCollectedMinor +
    terms.courierFeeMinor +
    (terms.tipMinor ?? 0)
  );
}

/**
 * Full courier payable across orders: the sum of per-order nets plus the fixed
 * amount for each attended day. Positive = Kanjo owes the courier.
 */
export function courierPayableMinor(
  orderNetsMinor: readonly number[],
  attendedDays: number,
): number {
  const orders = orderNetsMinor.reduce((sum, net) => sum + net, 0);
  return orders + attendedDays * COURIER_DAILY_BASE_MINOR;
}
