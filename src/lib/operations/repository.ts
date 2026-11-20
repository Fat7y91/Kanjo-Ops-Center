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

export type OperationWrite = {
  orderId: string;
  merchantId: string;
  courierId: string;
  paymentMethod: OperationLog["paymentMethod"];
  currency: OperationLog["currency"];
  orderValueMinor: number;
  deliveryFeeMinor: number;
  /** Courier's own earning; only set for settlement-driven imports. */
  courierFeeMinor?: number;
  couponId: string | null;
  walletDiscountMinor: number;
  walletDiscountReason: string;
  walletDiscountRef: string;
  note: string;
  loggedBy: string;
  /** Back-dated order date; defaults to now when omitted. */
  occurredAt?: string;
  /**
   * Raw settlement terms. When `settlementDriven` is true the posting trigger
   * builds a balanced COD entry from these figures instead of the legacy
   * rate-only entry. Left undefined for manual and legacy exports.
   */
  settlementDriven?: boolean;
  discountMinor?: number;
  rewardDiscountMinor?: number;
  shippingDiscountMinor?: number;
  tipMinor?: number;
  walletAmountMinor?: number;
  expectedTotalMinor?: number;
  amountDueMinor?: number;
  codCollectedMinor?: number;
  netDuePlatformMinor?: number;
  deliveredAt?: string;
};

const BATCH_WRITE_TIMEOUT_MS = 20_000;

function insertRow(write: OperationWrite): Record<string, unknown> {
  const row: Record<string, unknown> = {
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
    ...(write.occurredAt ? { occurred_at: write.occurredAt } : {}),
  };

  /* Settlement-driven rows carry the raw CSV terms. They are omitted for
   * manual/legacy writes so those keep the trigger's rate-only behaviour. */
  if (write.settlementDriven) {
    row.settlement_driven = true;
    row.courier_cut_minor = write.courierFeeMinor ?? 0;
    row.discount_minor = write.discountMinor ?? 0;
    row.reward_discount_minor = write.rewardDiscountMinor ?? 0;
    row.shipping_discount_minor = write.shippingDiscountMinor ?? 0;
    row.tip_minor = write.tipMinor ?? 0;
    row.wallet_amount_minor = write.walletAmountMinor ?? 0;
    row.expected_total_minor = write.expectedTotalMinor ?? 0;
    row.amount_due_minor = write.amountDueMinor ?? 0;
    row.cod_collected_minor = write.codCollectedMinor ?? 0;
    row.net_due_platform_minor = write.netDuePlatformMinor ?? 0;
    row.delivered_at = write.deliveredAt ?? null;
  }

  return row;
}

export async function insertOperation(
  write: OperationWrite,
): Promise<OperationLog> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_logs")
    .insert(insertRow(write))
    .select(OPERATION_COLUMNS_NO_JOIN)
    .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS))
    .single();

  if (error) throw error;
  return toOperation(data as unknown as OperationRow);
}

/**
 * Bulk insert for the CSV importer.
 *
 * One statement per chunk instead of one round trip per order. The posting and
 * freeze triggers still run per row, so money terms stay identical to a manual
 * entry. The caller falls back to a per-row retry when a chunk is rejected,
 * which keeps the original per-line error reporting.
 *
 * `order_id` is unique, so the insert is idempotent: re-running the same file
 * inserts nothing new. `operation_logs` is update-immutable, so a conflict is
 * ignored rather than overwritten — history is never rewritten.
 */
export async function insertOperationBatch(
  writes: readonly OperationWrite[],
): Promise<number> {
  if (writes.length === 0) return 0;
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_logs")
    .upsert(writes.map(insertRow), { onConflict: "order_id", ignoreDuplicates: true })
    .select("id")
    .abortSignal(AbortSignal.timeout(BATCH_WRITE_TIMEOUT_MS));

  if (error) throw error;
  return ((data ?? []) as { id: string }[]).length;
}

/**
 * Per-row idempotent insert for the importer's retry path.
 *
 * Returns true when the row was new, false when its `order_id` already exists.
 * Throws on any other database error so the caller can report the exact line.
 */
export async function insertImportedOperation(
  write: OperationWrite,
): Promise<boolean> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("operation_logs")
    .upsert(insertRow(write), { onConflict: "order_id", ignoreDuplicates: true })
    .select("id")
    .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));

  if (error) throw error;
  return ((data ?? []) as { id: string }[]).length > 0;
}

/**
 * Returns the subset of `orderIds` that already exist in the operations log.
 *
 * The importer asks this before writing so a re-uploaded sheet skips its
 * existing orders up front and reports an exact "duplicates skipped" count,
 * rather than relying on the unique index to silently drop them. Chunked so a
 * large file never exceeds the request URL limit.
 */
export async function findExistingOrderIds(
  orderIds: readonly string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  const unique = [...new Set(orderIds)];
  const chunkSize = 200;
  const client = getSupabaseServerClient();

  for (let start = 0; start < unique.length; start += chunkSize) {
    const chunk = unique.slice(start, start + chunkSize);
    const { data, error } = await client
      .schema("app")
      .from("operation_logs")
      .select("order_id")
      .in("order_id", chunk)
      .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));

    if (error) throw error;
    for (const row of (data ?? []) as { order_id: string }[]) {
      existing.add(row.order_id);
    }
  }

  return existing;
}
