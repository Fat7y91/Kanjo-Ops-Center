import { toKanjoBusinessDay } from "@/lib/couriers/tiered-pay";

import type { BiOrderMetricRow } from "./types";

/**
 * Pure order bucket builder.
 *
 * The server owns the SQL read; this module owns the money and dimension
 * mapping. Keeping the snake_case → dashboard conversion here lets the tests
 * prove `discount_minor` and `shipping_discount_minor` reach the summary without
 * standing up Supabase.
 */

export type RawOrder = {
  merchant_id: string;
  courier_id: string;
  coupon_code: string | null;
  currency: BiOrderMetricRow["currency"];
  order_value_minor: number;
  delivery_fee_minor: number;
  discount_minor: number | null;
  shipping_discount_minor: number | null;
  commission_minor: number;
  courier_cut_minor: number;
  coupon_discount_minor: number | null;
  coupon_platform_funded_minor: number | null;
  coupon_vendor_funded_minor: number | null;
  wallet_discount_minor: number | null;
  reward_discount_minor: number | null;
  occurred_at: string;
  merchants:
    | { name: string | null; city_id: string | null }
    | { name: string | null; city_id: string | null }[]
    | null;
  couriers:
    | { display_name: string | null; is_internal_staff: boolean | null }
    | { display_name: string | null; is_internal_staff: boolean | null }[]
    | null;
};

function embed<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

type Bucket = {
  date: string;
  occurredAt: string;
  businessDay: string;
  merchantId: string;
  merchantName: string;
  cityId: string | null;
  courierId: string;
  courierName: string;
  isInternalStaff: boolean;
  couponCode: string;
  currency: BiOrderMetricRow["currency"];
  orders: number;
  volume: number;
  deliveryFee: number;
  orderDiscount: number;
  shippingDiscount: number;
  commission: number;
  courierCut: number;
  couponDiscount: number;
  rewardDiscount: number;
  platformFunded: number;
  vendorFunded: number;
  walletDiscount: number;
};

export function aggregateOrderRows(
  rows: readonly RawOrder[],
): BiOrderMetricRow[] {
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const merchant = embed(row.merchants);
    const courier = embed(row.couriers);
    const merchantId = row.merchant_id;
    const courierId = row.courier_id;
    const couponCode = row.coupon_code ?? "";
    /* `delivered_at` is date-only, so the 14:00 cutoff needs `occurred_at`. */
    const businessDay = toKanjoBusinessDay(row.occurred_at);
    const key = `${businessDay}|${merchantId}|${courierId}|${couponCode}`;
    const current =
      buckets.get(key) ??
      ({
        date: businessDay,
        occurredAt: row.occurred_at,
        businessDay,
        merchantId,
        merchantName: merchant?.name?.trim() || merchantId,
        cityId: merchant?.city_id ?? null,
        courierId,
        courierName: courier?.display_name?.trim() || courierId,
        isInternalStaff: courier?.is_internal_staff ?? false,
        couponCode,
        currency: row.currency,
        orders: 0,
        volume: 0,
        deliveryFee: 0,
        orderDiscount: 0,
        shippingDiscount: 0,
        commission: 0,
        courierCut: 0,
        couponDiscount: 0,
        rewardDiscount: 0,
        platformFunded: 0,
        vendorFunded: 0,
        walletDiscount: 0,
      } satisfies Bucket);

    if (row.occurred_at > current.occurredAt) {
      current.occurredAt = row.occurred_at;
    }
    current.orders += 1;
    current.volume += Number(row.order_value_minor ?? 0);
    current.deliveryFee += Number(row.delivery_fee_minor ?? 0);
    current.orderDiscount += Number(row.discount_minor ?? 0);
    current.shippingDiscount += Number(row.shipping_discount_minor ?? 0);
    current.commission += Number(row.commission_minor ?? 0);
    current.courierCut += Number(row.courier_cut_minor ?? 0);
    current.couponDiscount += Number(row.coupon_discount_minor ?? 0);
    current.rewardDiscount += Number(row.reward_discount_minor ?? 0);
    current.platformFunded += Number(row.coupon_platform_funded_minor ?? 0);
    current.vendorFunded += Number(row.coupon_vendor_funded_minor ?? 0);
    current.walletDiscount += Number(row.wallet_discount_minor ?? 0);
    buckets.set(key, current);
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    volume: bucket.volume / 100,
    deliveryFee: bucket.deliveryFee / 100,
    orderDiscount: bucket.orderDiscount / 100,
    shippingDiscount: bucket.shippingDiscount / 100,
    commission: bucket.commission / 100,
    courierCut: bucket.courierCut / 100,
    couponDiscount: bucket.couponDiscount / 100,
    rewardDiscount: bucket.rewardDiscount / 100,
    platformFunded: bucket.platformFunded / 100,
    vendorFunded: bucket.vendorFunded / 100,
    walletDiscount: bucket.walletDiscount / 100,
  }));
}
