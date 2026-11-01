import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { ProfileError, fromDatabaseError } from "./errors";
import {
  findPayoutMethod,
  isProfileDatabaseConfigured,
  readProfile,
  toProfileView,
  upsertPayoutMethod,
  writeProfile,
  type ProfileView,
} from "./repository";
import {
  passwordChangeSchema,
  payoutMethodInputSchema,
  profileUpdateSchema,
  type PayoutMethodInput,
  type PayoutMethodRecord,
} from "./types";

/**
 * Tier 3 rules for the operator's own profile.
 *
 * Everything here acts on the caller's own row: the id always comes from the
 * session, never from the request body, so no request can edit another
 * operator's profile by changing a field.
 */

export function requireProfileDatabase(): void {
  if (!isProfileDatabaseConfigured()) {
    throw new ProfileError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }
}

export async function loadProfileSnapshot(
  userId: string,
): Promise<{
  profile: ProfileView | null;
  payoutMethod: PayoutMethodRecord | null;
}> {
  requireProfileDatabase();

  // Both reads degrade independently: a fresh deployment may have the profile
  // columns but not yet the payout table, and the page still renders.
  const [profileRow, payoutMethod] = await Promise.all([
    readProfile(userId).catch((error) => {
      if (isMissingSchemaObject(error)) return null;
      throw error;
    }),
    findPayoutMethod(userId).catch((error) => {
      if (isMissingSchemaObject(error)) return null;
      throw error;
    }),
  ]);

  return {
    profile: profileRow ? toProfileView(profileRow) : null,
    payoutMethod,
  };
}

export async function saveProfile(
  userId: string,
  rawInput: unknown,
): Promise<ProfileView> {
  requireProfileDatabase();
  const input = profileUpdateSchema.parse(rawInput);

  try {
    await writeProfile(userId, {
      fullName: input.fullName,
      email: input.email,
      avatarUrl: input.avatarUrl,
    });
  } catch (error) {
    if (isMissingSchemaObject(error)) {
      throw new ProfileError(
        "STORE_UNAVAILABLE",
        "ملف المستخدم غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    const mapped = fromDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }

  const row = await readProfile(userId);
  if (!row) {
    throw new ProfileError("PROFILE_MISSING", "تعذر تحميل الملف الشخصي.", 404);
  }
  return toProfileView(row);
}

/**
 * Changes the caller's password through Supabase Auth.
 *
 * The current password is re-verified with the anon key before the service-role
 * client sets the new one. Without that step anyone holding a live session
 * cookie could rotate the password and lock the real owner out.
 */
export async function changePassword(
  userId: string,
  phone: string,
  rawInput: unknown,
): Promise<void> {
  if (!hasSupabaseConfig() || !process.env.SUPABASE_ANON_KEY) {
    throw new ProfileError(
      "STORE_UNAVAILABLE",
      "تغيير كلمة المرور غير متاح على هذا النشر.",
      503,
    );
  }

  const input = passwordChangeSchema.parse(rawInput);

  const verifier = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    phone,
    password: input.currentPassword,
  });
  if (verifyError) {
    throw new ProfileError(
      "INVALID_PASSWORD",
      "كلمة المرور الحالية غير صحيحة.",
      422,
    );
  }

  const { error } = await getSupabaseServerClient().auth.admin.updateUserById(
    userId,
    { password: input.newPassword },
  );
  if (error) {
    throw new ProfileError(
      "PASSWORD_UPDATE_FAILED",
      "تعذر تحديث كلمة المرور. حاول لاحقاً.",
      502,
    );
  }
}

/** Field names the payout repository expects, mapped from the union input. */
function payoutWrite(input: PayoutMethodInput) {
  switch (input.method) {
    case "bank_account":
      return {
        bankName: input.bankName,
        accountHolder: input.accountHolder,
        accountNumber: input.accountNumber,
        iban: input.iban,
        walletProvider: null,
        walletPhone: null,
        instapayType: null,
        instapayValue: null,
      };
    case "e_wallet":
      return {
        bankName: null,
        accountHolder: null,
        accountNumber: null,
        iban: null,
        walletProvider: input.walletProvider,
        walletPhone: input.walletPhone,
        instapayType: null,
        instapayValue: null,
      };
    case "instapay":
      return {
        bankName: null,
        accountHolder: null,
        accountNumber: null,
        iban: null,
        walletProvider: null,
        walletPhone: null,
        instapayType: input.instapayType,
        instapayValue: input.instapayValue,
      };
  }
}

/**
 * Creates or replaces the caller's payout destination.
 *
 * The row returns to `pending` whenever its details change, so a saved edit is
 * never silently paid against an earlier approval. That reset is the SQL
 * trigger's job; this function only writes the new details.
 */
export async function savePayoutMethod(
  userId: string,
  rawInput: unknown,
): Promise<PayoutMethodRecord> {
  requireProfileDatabase();
  const input = payoutMethodInputSchema.parse(rawInput);

  try {
    return await upsertPayoutMethod(userId, input.method, payoutWrite(input));
  } catch (error) {
    if (isMissingSchemaObject(error)) {
      throw new ProfileError(
        "STORE_UNAVAILABLE",
        "بيانات الصرف غير مُفعّلة على هذا النشر بعد.",
        503,
      );
    }
    const mapped = fromDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}
