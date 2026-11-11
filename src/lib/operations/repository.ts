import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { resolvePartyNames } from "./party-lookup";
import { embedName } from "./rows";

import type { OperationLog } from "./types";

/**
 * Tier 4 repository for `app.couriers` and `app.operation_logs`.
 *
 * This is the only module that knows the column names in
 * `20261102000003_operations_clearinghouse.sql`. Reads degrade when the
 * deployment runs ahead of its migrations; writes keep strict errors.
 */

export function isOperationsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/**
 * Deadlines for the operations reads and writes.
 *
 * An edge request that waits on a slow database is killed by the platform with
 * an error the route cannot report as a 500, and the browser then sees an
 * aborted fetch. Bounding each call here converts that into a timeout the
 * service can translate, so the logger shows "retry" instead of losing the
 * order silently.
 */
const READ_TIMEOUT_MS = 6_000;
const WRITE_TIMEOUT_MS = 8_000;

/* ── Row shapes ─────────────────────────────────────────────────────────── */

type OperationRow = {
  id: string;
  order_id: string;
  merchant_id: string;
  courier_id: string;
  payment_method: OperationLog["paymentMethod"];
  currency: OperationLog["currency"];
  order_value_minor: number;
  delivery_fee_minor: number;
  commission_percent: number;
  commission_minor: number;
  courier_cut_percent: number;
  courier_cut_minor: number;
  coupon_code: string | null;
  coupon_discount_minor: number | null;
  coupon_shipping_minor: number | null;
  coupon_cashback_minor: number | null;
  coupon_platform_funded_minor: number | null;
  coupon_vendor_funded_minor: number | null;
  wallet_discount_minor: number | null;
  wallet_discount_reason: string | null;
  wallet_discount_ref: string | null;
  note: string;
  occurred_at: string;
  created_at: string;
  merchants: { name: string } | { name: string }[] | null;
  couriers: { display_name: string } | { display_name: string }[] | null;
};

const OPERATION_COLUMNS =
  "id,order_id,merchant_id,courier_id,payment_method,currency,order_value_minor,delivery_fee_minor,commission_percent,commission_minor,courier_cut_percent,courier_cut_minor,coupon_code,coupon_discount_minor,coupon_shipping_minor,coupon_cashback_minor,coupon_platform_funded_minor,coupon_vendor_funded_minor,wallet_discount_minor,wallet_discount_reason,wallet_discount_ref,note,occurred_at,created_at,merchants(name),couriers(display_name)";

const OPERATION_COLUMNS_NO_JOIN =
  "id,order_id,merchant_id,courier_id,payment_method,currency,order_value_minor,delivery_fee_minor,commission_percent,commission_minor,courier_cut_percent,courier_cut_minor,coupon_code,coupon_discount_minor,coupon_shipping_minor,coupon_cashback_minor,coupon_platform_funded_minor,coupon_vendor_funded_minor,wallet_discount_minor,wallet_discount_reason,wallet_discount_ref,note,occurred_at,created_at";


/* ── Mappers ────────────────────────────────────────────────────────────── */

function toOperation(row: OperationRow): OperationLog {
  return {
    id: row.id,
    orderId: row.order_id,
    merchantId: row.merchant_id,
    merchantName: embedName(row.merchants, "تاجر"),
    courierId: row.courier_id,
    courierName: embedName(row.couriers, "مندوب"),
    paymentMethod: row.payment_method,
    currency: row.currency,
    orderValue: Number(row.order_value_minor) / 100,
    deliveryFee: Number(row.delivery_fee_minor) / 100,
    commissionPercent: Number(row.commission_percent),
    commission: Number(row.commission_minor) / 100,
    courierCutPercent: Number(row.courier_cut_percent),
    courierCut: Number(row.courier_cut_minor) / 100,
    couponCode: row.coupon_code ?? "",
    couponDiscount: Number(row.coupon_discount_minor ?? 0) / 100,
    couponShippingDiscount: Number(row.coupon_shipping_minor ?? 0) / 100,
    couponCashback: Number(row.coupon_cashback_minor ?? 0) / 100,
    couponPlatformFunded: Number(row.coupon_platform_funded_minor ?? 0) / 100,
    couponVendorFunded: Number(row.coupon_vendor_funded_minor ?? 0) / 100,
    walletDiscount: Number(row.wallet_discount_minor ?? 0) / 100,
    walletDiscountReason: row.wallet_discount_reason ?? "",
    walletDiscountRef: row.wallet_discount_ref ?? "",
    note: row.note,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}


/* ── Operations ─────────────────────────────────────────────────────────── */

async function selectOperations(
  columns: string,
  limit: number,
): Promise<{ data: unknown; error: unknown }> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_logs")
    .select(columns)
    .order("occurred_at", { ascending: false })
    .limit(limit)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  return { data, error };
}

export async function listOperations(limit = 100): Promise<OperationLog[]> {
  const primary = await selectOperations(OPERATION_COLUMNS, limit);
  if (!primary.error) {
    return ((primary.data ?? []) as unknown as OperationRow[]).map(toOperation);
  }
  if (!isMissingSchemaObject(primary.error)) throw primary.error;

  const fallback = await selectOperations(OPERATION_COLUMNS_NO_JOIN, limit);
  if (fallback.error && isMissingSchemaObject(fallback.error)) return [];
  if (fallback.error) throw fallback.error;

  const rows = (fallback.data ?? []) as unknown as OperationRow[];
  if (rows.length === 0) return [];

  // Without the embed, resolve the roster names in one batch so the recent list
  // still shows a merchant/courier name rather than a raw identifier.
  const names = await resolvePartyNames({
    merchantIds: rows.map((row) => row.merchant_id),
    courierIds: rows.map((row) => row.courier_id),
  });

  return rows.map((row) =>
    toOperation({
      ...row,
      merchants: names.merchants.has(row.merchant_id)
        ? { name: names.merchants.get(row.merchant_id) as string }
        : null,
      couriers: names.couriers.has(row.courier_id)
        ? { display_name: names.couriers.get(row.courier_id) as string }
        : null,
    }),
  );
}

/**
 * One operation with its party names resolved.
 *
 * The detail view needs the frozen money terms of a single order. The joined
 * read is preferred; when the embed is unavailable the roster is queried once.
 */
export async function findOperation(
  operationId: string,
): Promise<OperationLog | null> {
  const client = getSupabaseServerClient();
  const primary = await client
    .schema("app")
    .from("operation_logs")
    .select(OPERATION_COLUMNS)
    .eq("id", operationId)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .maybeSingle();

  if (!primary.error) {
    return primary.data
      ? toOperation(primary.data as unknown as OperationRow)
      : null;
  }
  if (!isMissingSchemaObject(primary.error)) throw primary.error;

  const fallback = await client
    .schema("app")
    .from("operation_logs")
    .select(OPERATION_COLUMNS_NO_JOIN)
    .eq("id", operationId)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .maybeSingle();

  if (fallback.error && isMissingSchemaObject(fallback.error)) return null;
  if (fallback.error) throw fallback.error;
  if (!fallback.data) return null;

  const row = fallback.data as unknown as OperationRow;
  const names = await resolvePartyNames({
    merchantIds: [row.merchant_id],
    courierIds: [row.courier_id],
  });

  return toOperation({
    ...row,
    merchants: names.merchants.has(row.merchant_id)
      ? { name: names.merchants.get(row.merchant_id) as string }
      : null,
    couriers: names.couriers.has(row.courier_id)
      ? { display_name: names.couriers.get(row.courier_id) as string }
      : null,
  });
}

export async function insertOperation(write: {
  orderId: string;
  merchantId: string;
  courierId: string;
  paymentMethod: OperationLog["paymentMethod"];
  currency: OperationLog["currency"];
  orderValueMinor: number;
  deliveryFeeMinor: number;
  couponId: string | null;
  walletDiscountMinor: number;
  walletDiscountReason: string;
  walletDiscountRef: string;
  note: string;
  loggedBy: string;
}): Promise<OperationLog> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_logs")
    .insert({
      order_id: write.orderId,
      merchant_id: write.merchantId,
      courier_id: write.courierId,
      payment_method: write.paymentMethod,
      currency: write.currency,
      order_value_minor: write.orderValueMinor,
      delivery_fee_minor: write.deliveryFeeMinor,
      /* Courier profit is never entered by the logger: the freeze trigger
       * resolves it from the courier's fixed profit. Sending zero keeps the
       * employee blind to the amount while the database stays authoritative. */
      coupon_id: write.couponId,
      wallet_discount_minor: write.walletDiscountMinor,
      wallet_discount_reason: write.walletDiscountReason,
      wallet_discount_ref: write.walletDiscountRef,
      note: write.note,
      logged_by: write.loggedBy,
    })
    .select(OPERATION_COLUMNS_NO_JOIN)
    .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS))
    .single();

  if (error) throw error;
  return toOperation(data as unknown as OperationRow);
}
