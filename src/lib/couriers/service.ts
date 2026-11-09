import "server-only";

import { isUniqueViolation } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { CouriersError } from "./errors";
import {
  deleteCourier as deleteCourierRow,
  isCouriersDatabaseConfigured,
  listCouriers,
  updateCourier as updateCourierRow,
} from "./repository";
import {
  courierCreateSchema,
  courierUpdateSchema,
  type Courier,
  type CourierCreateInput,
} from "./types";

/**
 * Tier 3 rules for the delivery roster.
 *
 * Adding a partner mints the full operator account (auth user + profile) and
 * the roster row in one flow. If the roster write fails the auth user is
 * deleted, which cascades the profile, so a half-created partner cannot
 * survive with a login and no roster entry.
 */

function requireDatabase(): void {
  if (!isCouriersDatabaseConfigured()) {
    throw new CouriersError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed path id is a bad request, never a database round-trip. */
function requireCourierId(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new CouriersError("NOT_FOUND", "المندوب غير موجود.", 404);
  }
  return id;
}

export async function loadCouriersBoard(): Promise<Courier[]> {
  requireDatabase();
  return listCouriers();
}

async function createAuthUser(input: CourierCreateInput): Promise<string> {
  const client = getSupabaseServerClient();
  const { data, error } = await client.auth.admin.createUser({
    phone: input.phone,
    password: input.password,
    email: input.email === "" ? undefined : input.email,
    phone_confirm: true,
    email_confirm: input.email !== "",
    user_metadata: { full_name: input.fullName },
  });

  if (error || !data.user) {
    if (error?.code === "phone_exists" || error?.status === 422) {
      throw new CouriersError(
        "PHONE_TAKEN",
        "يوجد حساب مسجّل بهذا الرقم بالفعل.",
        409,
      );
    }
    throw new CouriersError(
      "AUTH_CREATE_FAILED",
      "تعذر إنشاء حساب الدخول للمندوب.",
      502,
    );
  }

  return data.user.id;
}

async function attachProfile(
  userId: string,
  input: CourierCreateInput,
): Promise<void> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("users")
    .update({
      full_name: input.fullName,
      email: input.email === "" ? null : input.email,
      title: "المندوب",
      clearance_level: 1,
    })
    .eq("id", userId)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new CouriersError(
      "PROFILE_FAILED",
      "تعذر حفظ بيانات المندوب.",
      502,
    );
  }
}

async function insertRosterRow(
  userId: string,
  input: CourierCreateInput,
): Promise<void> {
  const client = getSupabaseServerClient();
  const { error } = await client.schema("app").from("couriers").insert({
    user_id: userId,
    display_name: input.fullName,
    courier_cut_percent: input.cutPercent,
    active: input.active,
    vehicle_type: input.vehicleType,
    vehicle_plate: input.vehiclePlate,
    availability: input.availability,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      throw new CouriersError("CONFLICT", "هذا المندوب مسجّل بالفعل.", 409);
    }
    throw new CouriersError(
      "ROSTER_FAILED",
      "تعذر حفظ سجل المندوب.",
      502,
    );
  }
}

export async function createCourier(rawInput: unknown): Promise<Courier> {
  requireDatabase();
  const input = courierCreateSchema.parse(rawInput);
  const client = getSupabaseServerClient();

  const userId = await createAuthUser(input);

  try {
    await attachProfile(userId, input);
    await insertRosterRow(userId, input);
  } catch (error) {
    await client.auth.admin.deleteUser(userId).catch(() => undefined);
    throw error;
  }

  const created = (await listCouriers()).find(
    (courier) => courier.userId === userId,
  );
  if (!created) {
    throw new CouriersError("NOT_FOUND", "لم يُعثر على المندوب بعد الإنشاء.", 502);
  }
  return created;
}

export async function updateCourier(
  id: string,
  rawInput: unknown,
): Promise<Courier> {
  requireDatabase();
  const input = courierUpdateSchema.parse(rawInput);
  return updateCourierRow(requireCourierId(id), input);
}

export async function deleteCourier(id: string): Promise<void> {
  requireDatabase();
  await deleteCourierRow(requireCourierId(id));
}
