import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { PayoutMethodRecord, ReviewStatus } from "./types";

/**
 * Tier 4 repository for the profile, payout and capital tables.
 *
 * This is the only module that knows the column names in
 * `20261102000001_user_profiles_and_capital.sql`; callers use the domain types
 * from `./types`. Reads degrade when the deployment runs ahead of its
 * migrations, writes keep their strict error behaviour.
 */

/* ── Row shapes ─────────────────────────────────────────────────────────── */

type PayoutRow = {
  id: string;
  user_id: string;
  method: PayoutMethodRecord["method"];
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  iban: string | null;
  wallet_provider: string | null;
  wallet_phone: string | null;
  instapay_type: string | null;
  instapay_value: string | null;
  status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

const PAYOUT_COLUMNS =
  "id,user_id,method,bank_name,account_holder,account_number,iban,wallet_provider,wallet_phone,instapay_type,instapay_value,status,reviewed_by,reviewed_at,updated_at";

export function isProfileDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/* ── Mappers ────────────────────────────────────────────────────────────── */

export function toPayoutRecord(row: PayoutRow): PayoutMethodRecord {
  return {
    id: row.id,
    userId: row.user_id,
    method: row.method,
    bankName: row.bank_name,
    accountHolder: row.account_holder,
    accountNumber: row.account_number,
    iban: row.iban,
    walletProvider: row.wallet_provider,
    walletPhone: row.wallet_phone,
    instapayType: row.instapay_type,
    instapayValue: row.instapay_value,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    updatedAt: row.updated_at,
  };
}

export type ProfileRow = {
  id: string;
  phone: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  bank_info_status: ReviewStatus;
};

export type ProfileView = {
  id: string;
  phone: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  bankInfoStatus: ReviewStatus;
};

/* ── Profile ────────────────────────────────────────────────────────────── */

/** Profile detail for the signed-in operator. */
export async function readProfile(
  userId: string,
): Promise<ProfileRow | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("users")
    .select("id,phone,full_name,email,avatar_url,bank_info_status")
    .eq("id", userId)
    .maybeSingle();

  // A deployment that predates this migration has no avatar columns; the call
  // site renders the initials fallback instead of failing the page.
  if (error && isMissingSchemaObject(error)) return null;
  if (error) throw error;
  return (data as ProfileRow | null) ?? null;
}

/** Domain view of a profile row. The phone is the login identity, read-only. */
export function toProfileView(row: ProfileRow): ProfileView {
  return {
    id: row.id,
    phone: row.phone,
    fullName: row.full_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    bankInfoStatus: row.bank_info_status,
  };
}

/**
 * Self-service profile update.
 *
 * Only columns the operator owns: name, email and avatar. `clearance_level`,
 * `active` and the grant tables stay behind the governor path.
 */
export async function writeProfile(
  userId: string,
  patch: {
    fullName: string;
    email: string | null;
    avatarUrl: string | null;
  },
): Promise<void> {
  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from("users")
    .update({
      full_name: patch.fullName,
      email: patch.email,
      avatar_url: patch.avatarUrl,
    })
    .eq("id", userId);

  if (error) throw error;
}

/* ── Payout methods ─────────────────────────────────────────────────────── */

export async function findPayoutMethod(
  userId: string,
): Promise<PayoutMethodRecord | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("user_payout_methods")
    .select(PAYOUT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error && isMissingSchemaObject(error)) return null;
  if (error) throw error;
  return data ? toPayoutRecord(data as PayoutRow) : null;
}

export async function listPayoutMethods(
  status?: ReviewStatus,
): Promise<PayoutMethodRecord[]> {
  const client = getSupabaseServerClient();
  const base = client
    .schema("app")
    .from("user_payout_methods")
    .select(PAYOUT_COLUMNS)
    .order("updated_at", { ascending: false });

  const scoped = status ? base.eq("status", status) : base;
  const { data, error } = await scoped;

  if (error && isMissingSchemaObject(error)) return [];
  if (error) throw error;
  return ((data ?? []) as PayoutRow[]).map(toPayoutRecord);
}

type PayoutWrite = {
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  iban: string | null;
  walletProvider: string | null;
  walletPhone: string | null;
  instapayType: string | null;
  instapayValue: string | null;
};

/**
 * Creates or replaces the operator's single payout method.
 *
 * The upsert targets `user_id`, which carries the unique index, so a second
 * submission updates the existing row instead of failing. The DB trigger owns
 * the decision reset: a detail change always returns the row to pending.
 */
export async function upsertPayoutMethod(
  userId: string,
  method: PayoutMethodRecord["method"],
  write: PayoutWrite,
): Promise<PayoutMethodRecord> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("user_payout_methods")
    .upsert(
      {
        user_id: userId,
        method,
        ...write,
      },
      { onConflict: "user_id" },
    )
    .select(PAYOUT_COLUMNS)
    .single();

  if (error) throw error;
  return toPayoutRecord(data as PayoutRow);
}

export async function decidePayoutMethod(
  id: string,
  status: Exclude<ReviewStatus, "pending">,
  reviewedBy: string,
): Promise<PayoutMethodRecord> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("user_payout_methods")
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(PAYOUT_COLUMNS)
    .single();

  if (error) throw error;
  return toPayoutRecord(data as PayoutRow);
}
