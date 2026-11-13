import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { matchKey } from "./orders-import";
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
  // The directory reads the whole book, so the import roster must too: a fixed
  // cap would silently drop the tail of the alphabet and reject merchants the
  // operator can plainly see on the directory screen.
  const pageSize = 1000;
  const all: { id: string; name: string }[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .schema("app")
      .from("merchants")
      .select("id,name")
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

    if (error) {
      if (isMissingSchemaObject(error)) return all;
      throw error;
    }

    const rows = (data ?? []) as { id: string; name: string }[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }

  return all.map((row) => ({ id: row.id, name: row.name }));
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

/**
 * Name-keyed roster for the bulk order import.
 *
 * A CSV names its parties, not their ids, so the importer matches on the same
 * normalised key it derives from the file. Merchant names are unique per book;
 * courier display names are the only human label the export carries. A
 * collision keeps the first row and is otherwise harmless, because the import
 * reports any row that resolves to an unknown party instead of guessing.
 */
export async function loadImportRoster(): Promise<{
  merchants: Map<string, string>;
  couriers: Map<string, string>;
}> {
  const [merchants, couriers] = await Promise.all([
    listMerchantOptions(),
    listCouriers(),
  ]);

  const merchantMap = new Map<string, string>();
  for (const merchant of merchants) {
    const key = matchKey(merchant.name);
    if (key && !merchantMap.has(key)) merchantMap.set(key, merchant.id);
  }

  const courierMap = new Map<string, string>();
  for (const courier of couriers) {
    const key = matchKey(courier.displayName);
    if (key && !courierMap.has(key)) courierMap.set(key, courier.id);
  }

  return { merchants: merchantMap, couriers: courierMap };
}
