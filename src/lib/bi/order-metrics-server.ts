import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { BiOrderMetricRow } from "./types";

/**
 * Order facts for the executive command center.
 *
 * Orders are aggregated into daily dimension buckets on the server so the
 * dashboard ships a compact payload instead of every ledger row. Buckets keep
 * the dimensions the module filters on (merchant, courier, city, coupon, day),
 * but collapse individual orders.
 */

const ROW_LIMIT = 20_000;
const TIMEOUT_MS = 8_000;

type RawOrder = {
  merchant_id: string;
  courier_id: string;
  coupon_code: string | null;
  currency: BiOrderMetricRow["currency"];
  order_value_minor: number;
  commission_minor: number;
  courier_cut_minor: number;
  coupon_discount_minor: number | null;
  coupon_platform_funded_minor: number | null;
  coupon_vendor_funded_minor: number | null;
  wallet_discount_minor: number | null;
  occurred_at: string;
  merchants: { name: string | null; city_id: string | null } | { name: string | null; city_id: string | null }[] | null;
  couriers: { display_name: string | null } | { display_name: string | null }[] | null;
};

const COLUMNS =
  "merchant_id,courier_id,coupon_code,currency,order_value_minor,commission_minor,courier_cut_minor,coupon_discount_minor,coupon_platform_funded_minor,coupon_vendor_funded_minor,wallet_discount_minor,occurred_at,merchants(name,city_id),couriers(display_name)";

const COLUMNS_NO_JOIN =
  "merchant_id,courier_id,coupon_code,currency,order_value_minor,commission_minor,courier_cut_minor,coupon_discount_minor,coupon_platform_funded_minor,coupon_vendor_funded_minor,wallet_discount_minor,occurred_at";

function embed<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

type Bucket = {
  date: string;
  merchantId: string;
  merchantName: string;
  cityId: string | null;
  courierId: string;
  courierName: string;
  couponCode: string;
  currency: BiOrderMetricRow["currency"];
  orders: number;
  volume: number;
  commission: number;
  courierCut: number;
  couponDiscount: number;
  platformFunded: number;
  vendorFunded: number;
  walletDiscount: number;
};

async function selectOrders(columns: string) {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_logs")
    .select(columns)
    .order("occurred_at", { ascending: false })
    .limit(ROW_LIMIT)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  return { data, error };
}

export async function loadOrderMetrics(): Promise<BiOrderMetricRow[]> {
  const primary = await selectOrders(COLUMNS);
  let rows: RawOrder[];

  if (!primary.error) {
    rows = (primary.data ?? []) as unknown as RawOrder[];
  } else if (isMissingSchemaObject(primary.error)) {
    const fallback = await selectOrders(COLUMNS_NO_JOIN);
    if (fallback.error) return [];
    rows = (fallback.data ?? []) as unknown as RawOrder[];
  } else {
    return [];
  }

  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const merchant = embed(row.merchants);
    const courier = embed(row.couriers);
    const merchantId = row.merchant_id;
    const courierId = row.courier_id;
    const couponCode = row.coupon_code ?? "";
    const date = row.occurred_at.slice(0, 10);
    const key = `${date}|${merchantId}|${courierId}|${couponCode}`;
    const current =
      buckets.get(key) ??
      ({
        date,
        merchantId,
        merchantName: merchant?.name?.trim() || merchantId,
        cityId: merchant?.city_id ?? null,
        courierId,
        courierName: courier?.display_name?.trim() || courierId,
        couponCode,
        currency: row.currency,
        orders: 0,
        volume: 0,
        commission: 0,
        courierCut: 0,
        couponDiscount: 0,
        platformFunded: 0,
        vendorFunded: 0,
        walletDiscount: 0,
      } satisfies Bucket);

    current.orders += 1;
    current.volume += Number(row.order_value_minor ?? 0);
    current.commission += Number(row.commission_minor ?? 0);
    current.courierCut += Number(row.courier_cut_minor ?? 0);
    current.couponDiscount += Number(row.coupon_discount_minor ?? 0);
    current.platformFunded += Number(row.coupon_platform_funded_minor ?? 0);
    current.vendorFunded += Number(row.coupon_vendor_funded_minor ?? 0);
    current.walletDiscount += Number(row.wallet_discount_minor ?? 0);
    buckets.set(key, current);
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    volume: bucket.volume / 100,
    commission: bucket.commission / 100,
    courierCut: bucket.courierCut / 100,
    couponDiscount: bucket.couponDiscount / 100,
    platformFunded: bucket.platformFunded / 100,
    vendorFunded: bucket.vendorFunded / 100,
    walletDiscount: bucket.walletDiscount / 100,
  }));
}
