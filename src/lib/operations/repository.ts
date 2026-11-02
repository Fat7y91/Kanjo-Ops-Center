import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { embedName } from "./rows";

import type {
  CourierOption,
  MerchantOption,
  OperationLog,
} from "./types";

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
  note: string;
  occurred_at: string;
  created_at: string;
  merchants: { name: string } | { name: string }[] | null;
  couriers: { display_name: string } | { display_name: string }[] | null;
};


type CourierRow = {
  id: string;
  user_id: string;
  display_name: string;
  courier_cut_percent: number;
  active: boolean;
  users: { full_name: string } | { full_name: string }[] | null;
};

const OPERATION_COLUMNS =
  "id,order_id,merchant_id,courier_id,payment_method,currency,order_value_minor,delivery_fee_minor,commission_percent,commission_minor,courier_cut_percent,courier_cut_minor,note,occurred_at,created_at,merchants(name),couriers(display_name)";

const OPERATION_COLUMNS_NO_JOIN =
  "id,order_id,merchant_id,courier_id,payment_method,currency,order_value_minor,delivery_fee_minor,commission_percent,commission_minor,courier_cut_percent,courier_cut_minor,note,occurred_at,created_at";


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
    note: row.note,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}


/* ── Lookups for the logging form ───────────────────────────────────────── */

export async function listCouriers(): Promise<CourierOption[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select("id,user_id,display_name,courier_cut_percent,active,users(full_name)")
    .eq("active", true)
    .order("display_name", { ascending: true });

  if (error && isMissingSchemaObject(error)) return [];
  if (error) throw error;

  return ((data ?? []) as unknown as CourierRow[]).map((row) => ({
    id: row.id,
    displayName: row.display_name || embedName(row.users, "مندوب"),
    cutPercent: Number(row.courier_cut_percent),
    active: row.active,
  }));
}

export async function listMerchantOptions(): Promise<MerchantOption[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("merchants")
    .select("id,name,agreed_commission,target_commission")
    .order("name", { ascending: true })
    .limit(200);

  if (error && isMissingSchemaObject(error)) return [];
  if (error) throw error;

  return ((data ?? []) as {
    id: string;
    name: string;
    agreed_commission: number | null;
    target_commission: number;
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    commissionPercent: Number(row.agreed_commission ?? row.target_commission ?? 0),
  }));
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
    .limit(limit);
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
  return ((fallback.data ?? []) as unknown as OperationRow[]).map(toOperation);
}

export async function insertOperation(write: {
  orderId: string;
  merchantId: string;
  courierId: string;
  paymentMethod: OperationLog["paymentMethod"];
  currency: OperationLog["currency"];
  orderValueMinor: number;
  deliveryFeeMinor: number;
  courierCutMinor: number;
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
      courier_cut_minor: write.courierCutMinor,
      note: write.note,
      logged_by: write.loggedBy,
    })
    .select(OPERATION_COLUMNS_NO_JOIN)
    .single();

  if (error) throw error;
  return toOperation(data as unknown as OperationRow);
}
