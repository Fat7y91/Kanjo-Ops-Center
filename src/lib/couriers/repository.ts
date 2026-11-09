import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isForeignKeyViolation,
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { CouriersError } from "./errors";
import { loadCourierTotals } from "./totals";
import type { Courier, CourierCreateInput, CourierUpdateInput } from "./types";

/**
 * Tier 4 repository for the delivery roster.
 *
 * Identity (name, phone, email) lives on `app.users`; roster facts (vehicle,
 * plate, availability, cut rate) live on `app.couriers`. The list projection
 * joins the two and folds the operations ledger into earnings, deliveries and
 * the pending clearinghouse balance.
 */

export function isCouriersDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

type UserEmbed =
  | { full_name: string | null; phone: string | null; email: string | null }
  | { full_name: string | null; phone: string | null; email: string | null }[]
  | null;

type CourierRow = {
  id: string;
  user_id: string;
  display_name: string;
  courier_cut_percent: number;
  active: boolean;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  availability: string | null;
  applied_at: string | null;
  created_at: string;
  users: UserEmbed;
};

const COURIER_COLUMNS =
  "id,user_id,display_name,courier_cut_percent,active,vehicle_type,vehicle_plate,availability,applied_at,created_at,users(full_name,phone,email)";

const COURIER_COLUMNS_LEGACY =
  "id,user_id,display_name,courier_cut_percent,active,created_at,users(full_name)";

function embedUser(embed: UserEmbed): {
  fullName: string;
  phone: string;
  email: string;
} {
  const value = Array.isArray(embed) ? embed[0] : embed;
  return {
    fullName: value?.full_name?.trim() ?? "",
    phone: value?.phone?.trim() ?? "",
    email: value?.email?.trim() ?? "",
  };
}

function toCourier(
  row: CourierRow,
  earnings: Map<string, number>,
  deliveries: Map<string, number>,
  balances: Map<string, number>,
): Courier {
  const user = embedUser(row.users);
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name || user.fullName || "مندوب",
    phone: user.phone,
    email: user.email,
    cutPercent: Number(row.courier_cut_percent ?? 0),
    active: row.active,
    vehicleType: row.vehicle_type ?? "",
    vehiclePlate: row.vehicle_plate ?? "",
    availability: (row.availability ?? "available") as Courier["availability"],
    appliedAt: row.applied_at ?? row.created_at,
    earnings: earnings.get(row.id) ?? 0,
    deliveries: deliveries.get(row.id) ?? 0,
    balance: balances.get(row.id) ?? 0,
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
      toCourier(row, totals.earnings, totals.deliveries, totals.balances),
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
    toCourier(row, totals.earnings, totals.deliveries, totals.balances),
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
    courier_cut_percent: input.cutPercent,
    vehicle_type: input.vehicleType,
    vehicle_plate: input.vehiclePlate,
    availability: input.availability,
    active: input.active,
  };
}

/** Updates the roster row and keeps the identity record in step. */
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
    .select("id,user_id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new CouriersError("CONFLICT", "هذا المندوب مسجّل بالفعل.", 409);
    }
    throw error;
  }
  if (!data) {
    throw new CouriersError("NOT_FOUND", "المندوب غير موجود.", 404);
  }

  const userId = (data as { user_id: string }).user_id;
  const { error: userError } = await client
    .schema("app")
    .from("users")
    .update({
      full_name: input.fullName,
      email: input.email === "" ? null : input.email,
    })
    .eq("id", userId);

  if (userError && !isMissingSchemaObject(userError)) throw userError;

  if (input.password !== "") {
    const { error: authError } = await client.auth.admin.updateUserById(userId, {
      password: input.password,
    });
    if (authError) {
      throw new CouriersError(
        "PASSWORD_FAILED",
        "تعذر تحديث كلمة مرور المندوب.",
        502,
      );
    }
  }

  const updated = await findCourierById(id);
  if (!updated) throw new CouriersError("NOT_FOUND", "المندوب غير موجود.", 404);
  return updated;
}

/**
 * Removes a partner.
 *
 * The operations ledger references the roster row with `on delete restrict`,
 * so a partner with logged deliveries cannot be erased — that history must stay
 * attributable. The caller is told to deactivate instead.
 */
export async function deleteCourier(id: string): Promise<void> {
  const client = getSupabaseServerClient();

  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new CouriersError("NOT_FOUND", "المندوب غير موجود.", 404);

  const userId = (data as { user_id: string }).user_id;

  const { error: deleteError } = await client
    .schema("app")
    .from("couriers")
    .delete()
    .eq("id", id);

  if (deleteError) {
    if (isForeignKeyViolation(deleteError)) {
      throw new CouriersError(
        "COURIER_IN_USE",
        "لا يمكن حذف مندوب له عمليات مسجلة. أوقفه بدلاً من حذفه.",
        409,
      );
    }
    throw deleteError;
  }

  await client.auth.admin.deleteUser(userId).catch(() => undefined);
}
