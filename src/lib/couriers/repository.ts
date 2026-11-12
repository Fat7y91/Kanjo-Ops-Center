import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isForeignKeyViolation,
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { CouriersError } from "./errors";
import { parsePayoutPreferences } from "./payout";
import { loadCourierTotals, type CourierTotals } from "./totals";
import type { Courier, CourierCreateInput, CourierUpdateInput } from "./types";

/**
 * Tier 4 repository for the delivery roster.
 *
 * The roster row is the whole record: a courier is not an operator, so there is
 * no identity join and no auth account to keep in step. Earnings, deliveries
 * and the pending clearing balance are folded from the operations ledger.
 */

export function isCouriersDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

type CourierRow = {
  id: string;
  display_name: string;
  phone: string;
  fixed_profit_per_order_minor: number;
  payout_preferences: unknown;
  active: boolean;
  applied_at: string | null;
  created_at: string;
};

const COURIER_COLUMNS =
  "id,display_name,phone,fixed_profit_per_order_minor,payout_preferences,active,applied_at,created_at";

const COURIER_COLUMNS_LEGACY =
  "id,display_name,phone,active,applied_at,created_at";

function toCourier(row: CourierRow, totals: CourierTotals): Courier {
  return {
    id: row.id,
    displayName: row.display_name?.trim() || "مندوب",
    phone: row.phone?.trim() ?? "",
    fixedProfitPerOrder: Number(row.fixed_profit_per_order_minor ?? 0) / 100,
    payoutPreferences: parsePayoutPreferences(row.payout_preferences),
    active: row.active,
    appliedAt: row.applied_at ?? row.created_at,
    earnings: totals.earnings.get(row.id) ?? 0,
    deliveries: totals.deliveries.get(row.id) ?? 0,
    balance: totals.balances.get(row.id) ?? 0,
    monthlyDeliveryAmount: totals.monthlyDeliveryAmount.get(row.id) ?? 0,
    monthlyProfit: totals.monthlyProfit.get(row.id) ?? 0,
  };
}

export async function listCouriers(): Promise<Courier[]> {
  const client = getSupabaseServerClient();
  const totals = await loadCourierTotals();

  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select(COURIER_COLUMNS)
    .order("applied_at", { ascending: false });

  if (!error) {
    return ((data ?? []) as unknown as CourierRow[]).map((row) =>
      toCourier(row, totals),
    );
  }
  if (!isMissingSchemaObject(error)) throw error;

  const fallback = await client
    .schema("app")
    .from("couriers")
    .select(COURIER_COLUMNS_LEGACY)
    .order("created_at", { ascending: false });

  if (fallback.error && isMissingSchemaObject(fallback.error)) return [];
  if (fallback.error) throw fallback.error;

  return ((fallback.data ?? []) as unknown as CourierRow[]).map((row) =>
    toCourier(row, totals),
  );
}

export async function findCourierById(id: string): Promise<Courier | null> {
  const all = await listCouriers();
  return all.find((courier) => courier.id === id) ?? null;
}

type CourierWrite = CourierCreateInput | CourierUpdateInput;

function rosterPatch(input: CourierWrite) {
  return {
    display_name: input.fullName,
    phone: input.phone,
    fixed_profit_per_order_minor: Math.round(input.fixedProfit * 100),
    payout_preferences: input.payout,
    active: input.active,
  };
}

export async function insertCourier(
  input: CourierCreateInput,
): Promise<Courier> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .insert(rosterPatch(input))
    .select("id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new CouriersError(
        "PHONE_TAKEN",
        "يوجد مندوب توصيل مسجّل بهذا الرقم بالفعل.",
        409,
      );
    }
    throw new CouriersError("ROSTER_FAILED", "تعذر حفظ سجل مندوب التوصيل.", 502);
  }

  const created = data ? await findCourierById((data as { id: string }).id) : null;
  if (!created) {
    throw new CouriersError("NOT_FOUND", "لم يُعثر على مندوب التوصيل بعد الإنشاء.", 502);
  }
  return created;
}

/**
 * Creates a placeholder roster row for a courier named in an imported file.
 *
 * The spreadsheet only carries the display name, so the phone stays empty, the
 * payout block stays empty and the fixed profit starts at zero: the import can
 * never invent an earning rate. The operator completes the record afterwards
 * from the couriers screen.
 */
export async function insertImportedCourier(displayName: string): Promise<string> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .insert({
      display_name: displayName,
      phone: "",
      fixed_profit_per_order_minor: 0,
      payout_preferences: {},
      active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new CouriersError("ROSTER_FAILED", "تعذر حفظ سجل مندوب التوصيل.", 502);
  }
  return (data as { id: string }).id;
}

export async function updateCourier(
  id: string,
  input: CourierUpdateInput,
): Promise<Courier> {
  const client = getSupabaseServerClient();

  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .update(rosterPatch(input))
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new CouriersError(
        "PHONE_TAKEN",
        "يوجد مندوب توصيل مسجّل بهذا الرقم بالفعل.",
        409,
      );
    }
    throw error;
  }
  if (!data) {
    throw new CouriersError("NOT_FOUND", "مندوب التوصيل غير موجود.", 404);
  }

  const updated = await findCourierById(id);
  if (!updated) throw new CouriersError("NOT_FOUND", "مندوب التوصيل غير موجود.", 404);
  return updated;
}

/**
 * Removes a roster record.
 *
 * The operations ledger references the roster row with `on delete restrict`, so
 * a partner with logged deliveries cannot be erased — that history must stay
 * attributable. The caller is told to deactivate instead.
 */
export async function deleteCourier(id: string): Promise<void> {
  const client = getSupabaseServerClient();

  const { error } = await client
    .schema("app")
    .from("couriers")
    .delete()
    .eq("id", id);

  if (error) {
    if (isForeignKeyViolation(error)) {
      throw new CouriersError(
        "COURIER_IN_USE",
        "لا يمكن حذف مندوب توصيل له عمليات مسجلة. أوقفه بدلاً من حذفه.",
        409,
      );
    }
    throw error;
  }
}
