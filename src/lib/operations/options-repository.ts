import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { CourierOption, CouponOption, MerchantOption } from "./types";

const READ_TIMEOUT_MS = 6_000;

type CourierRow = {
  id: string;
  display_name: string;
  active: boolean;
};

type CouponOptionRow = {
  id: string;
  code: string;
  coupon_type: CouponOption["couponType"];
  active: boolean;
};

/**
 * Tier 4 option lookups for the blind-entry form.
 *
 * The logger picks a courier, a merchant and (optionally) a coupon by name; it
 * never sees a money figure. These reads return only the label fields the
 * comboboxes render, so the blind-entry surface cannot pull a cost or split
 * through the option list.
 */

export async function listCouriers(): Promise<CourierOption[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select("id,display_name,active")
    .eq("active", true)
    .order("display_name", { ascending: true })
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error && isMissingSchemaObject(error)) return [];
  if (error) throw error;

  return ((data ?? []) as unknown as CourierRow[]).map((row) => ({
    id: row.id,
    displayName: row.display_name?.trim() || "مندوب",
    active: row.active,
  }));
}

export async function listMerchantOptions(): Promise<MerchantOption[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("merchants")
    .select("id,name")
    .order("name", { ascending: true })
    .limit(500)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error && isMissingSchemaObject(error)) return [];
  if (error) throw error;

  return ((data ?? []) as { id: string; name: string }[]).map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

export async function listCouponOptions(): Promise<CouponOption[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("coupons")
    .select("id,code,coupon_type,active")
    .eq("active", true)
    .order("code", { ascending: true })
    .limit(1000)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error && isMissingSchemaObject(error)) return [];
  if (error) throw error;

  return ((data ?? []) as unknown as CouponOptionRow[]).map((row) => ({
    id: row.id,
    code: row.code,
    couponType: row.coupon_type,
    active: row.active,
  }));
}
