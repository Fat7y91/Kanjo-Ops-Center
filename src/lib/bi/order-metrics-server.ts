import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { aggregateOrderRows, type RawOrder } from "./order-metrics-aggregate";
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

const COLUMNS =
  "merchant_id,courier_id,coupon_code,currency,order_value_minor,delivery_fee_minor,discount_minor,shipping_discount_minor,commission_minor,courier_cut_minor,coupon_discount_minor,coupon_platform_funded_minor,coupon_vendor_funded_minor,wallet_discount_minor,reward_discount_minor,occurred_at,merchants(name,city_id),couriers(display_name,is_internal_staff)";

const COLUMNS_NO_JOIN =
  "merchant_id,courier_id,coupon_code,currency,order_value_minor,delivery_fee_minor,discount_minor,shipping_discount_minor,commission_minor,courier_cut_minor,coupon_discount_minor,coupon_platform_funded_minor,coupon_vendor_funded_minor,wallet_discount_minor,reward_discount_minor,occurred_at";

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

  return aggregateOrderRows(rows);
}
