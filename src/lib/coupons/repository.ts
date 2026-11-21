import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { CouponCsvRow } from "./csv";
import type {
  Coupon,
  CouponCreateInput,
  CouponUpdateInput,
  CouponFunding,
  CouponType,
} from "./types";

/**
 * Tier 4 repository for `app.coupons`.
 *
 * Only module that knows the column names in `20261122000001_coupons.sql`.
 * Reads degrade when the deployment runs ahead of its migrations; writes keep
 * strict errors.
 */

export function isCouponsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

type CouponRow = {
  id: string;
  code: string;
  coupon_type: CouponType;
  active: boolean;
  discount_funded_by: CouponFunding;
  vendor_funding_percent: number;
  stackable: boolean;
  stack_priority: number;
  discount_amount_minor: number;
  shipping_discount_minor: number;
  cashback_amount_minor: number;
  total_impact_minor: number;
  vendor_funded_minor: number;
  platform_funded_minor: number;
  budget_applied_minor: number;
  budget_cap_minor: number | null;
  budget_used_minor: number;
  max_discount_minor: number | null;
  budget_remaining_minor: number | null;
  uses_count: number;
  last_used_at: string | null;
  source_created_at: string;
};

const COUPON_COLUMNS =
  "id,code,coupon_type,active,discount_funded_by,vendor_funding_percent,stackable,stack_priority,discount_amount_minor,shipping_discount_minor,cashback_amount_minor,total_impact_minor,vendor_funded_minor,platform_funded_minor,budget_applied_minor,budget_cap_minor,budget_used_minor,budget_remaining_minor,max_discount_minor,uses_count,last_used_at,source_created_at";

function toCoupon(row: CouponRow): Coupon {
  const isPercent = row.coupon_type === "percentage_discount";
  const toMajor = (minor: number | null) => Number(minor ?? 0) / 100;
  return {
    id: row.id,
    code: row.code,
    couponType: row.coupon_type,
    active: row.active,
    discountFundedBy: row.discount_funded_by,
    vendorFundingPercent: Number(row.vendor_funding_percent),
    stackable: row.stackable,
    stackPriority: row.stack_priority,
    /* Percent coupons store basis points; surface the rate as a percentage. */
    discountAmount: isPercent
      ? Number(row.discount_amount_minor) / 100
      : toMajor(row.discount_amount_minor),
    shippingDiscount: toMajor(row.shipping_discount_minor),
    cashbackAmount: toMajor(row.cashback_amount_minor),
    totalImpact: toMajor(row.total_impact_minor),
    vendorFunded: toMajor(row.vendor_funded_minor),
    platformFunded: toMajor(row.platform_funded_minor),
    budgetApplied: toMajor(row.budget_applied_minor),
    budgetCap:
      row.budget_cap_minor === null ? null : toMajor(row.budget_cap_minor),
    budgetUsed: toMajor(row.budget_used_minor),
    budgetRemaining:
      row.budget_remaining_minor === null
        ? null
        : toMajor(row.budget_remaining_minor),
    maxDiscount:
      row.max_discount_minor === null ? null : toMajor(row.max_discount_minor),
    usesCount: row.uses_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.source_created_at,
  };
}

export async function listCoupons(): Promise<Coupon[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("coupons")
    .select(COUPON_COLUMNS)
    .order("source_created_at", { ascending: false })
    .limit(2000);

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as CouponRow[]).map(toCoupon);
}

/** Major-unit input → the minor/rate column the schema stores. */
function discountAmountColumn(
  couponType: CouponType,
  discountAmount: number,
): number {
  /* `discount_amount_minor` holds basis points for percentage coupons. The
   * form supplies the rate as a percentage (15), so ×100 gives basis points;
   * for every other type the value is currency and also ×100 gives minor units. */
  void couponType;
  return Math.round(discountAmount * 100);
}

export async function insertCoupon(
  input: CouponCreateInput,
): Promise<Coupon> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("coupons")
    .insert({
      code: input.code,
      coupon_type: input.couponType,
      active: input.active,
      discount_funded_by: input.discountFundedBy,
      vendor_funding_percent: input.vendorFundingPercent,
      stackable: input.stackable,
      stack_priority: input.stackPriority,
      discount_amount_minor: discountAmountColumn(
        input.couponType,
        input.discountAmount,
      ),
      shipping_discount_minor: Math.round(input.shippingDiscount * 100),
      cashback_amount_minor: Math.round(input.cashbackAmount * 100),
      budget_cap_minor:
        input.budgetCap === null ? null : Math.round(input.budgetCap * 100),
      max_discount_minor:
        input.maxDiscount === null ? null : Math.round(input.maxDiscount * 100),
    })
    .select(COUPON_COLUMNS)
    .single();

  if (error) throw error;
  return toCoupon(data as unknown as CouponRow);
}

export async function updateCoupon(
  id: string,
  input: CouponUpdateInput,
): Promise<Coupon> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("coupons")
    .update({
      code: input.code,
      coupon_type: input.couponType,
      active: input.active,
      discount_funded_by: input.discountFundedBy,
      vendor_funding_percent: input.vendorFundingPercent,
      stackable: input.stackable,
      stack_priority: input.stackPriority,
      discount_amount_minor: discountAmountColumn(
        input.couponType,
        input.discountAmount,
      ),
      shipping_discount_minor: Math.round(input.shippingDiscount * 100),
      cashback_amount_minor: Math.round(input.cashbackAmount * 100),
      budget_cap_minor:
        input.budgetCap === null ? null : Math.round(input.budgetCap * 100),
      max_discount_minor:
        input.maxDiscount === null ? null : Math.round(input.maxDiscount * 100),
    })
    .eq("id", id)
    .select(COUPON_COLUMNS)
    .single();

  if (error) throw error;
  return toCoupon(data as unknown as CouponRow);
}

export async function deleteCoupon(id: string): Promise<void> {
  const client = getSupabaseServerClient();
  const { error } = await client.schema("app").from("coupons").delete().eq("id", id);
  if (error) throw error;
}

/* ── Bulk import ────────────────────────────────────────────────────────── */

/**
 * Upserts parsed CSV rows via `app.upsert_coupons`.
 *
 * The unique index is functional (`upper(btrim(code))`), which PostgREST cannot
 * name as a conflict target, so the write goes through a SECURITY DEFINER
 * function that conflicts on that exact index. Rows are chunked to keep each
 * call bounded. Returns how many rows were sent.
 */
export async function upsertCouponRows(
  rows: CouponCsvRow[],
  chunkSize = 500,
): Promise<number> {
  if (rows.length === 0) return 0;
  const client = getSupabaseServerClient();
  let written = 0;

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const payload = chunk.map((row) => ({
      code: row.code,
      coupon_type: row.couponType,
      active: row.active,
      discount_funded_by: row.discountFundedBy,
      vendor_funding_percent: row.vendorFundingPercent,
      stackable: row.stackable,
      stack_priority: row.stackPriority,
      uses_count: row.usesCount,
      discount_amount_minor: row.discountAmountMinor,
      shipping_discount_minor: row.shippingDiscountMinor,
      cashback_amount_minor: row.cashbackAmountMinor,
      total_impact_minor: row.totalImpactMinor,
      vendor_funded_minor: row.vendorFundedMinor,
      platform_funded_minor: row.platformFundedMinor,
      budget_applied_minor: row.budgetAppliedMinor,
      budget_cap_minor: row.budgetCapMinor,
      budget_used_minor: row.budgetUsedMinor,
      max_discount_minor: row.maxDiscountMinor,
      last_used_at: row.lastUsedAt,
      source_created_at: row.sourceCreatedAt,
    }));

    const { error } = await client
      .schema("app")
      .rpc("upsert_coupons", { p_rows: payload });

    if (error) throw error;
    written += chunk.length;
  }

  return written;
}
