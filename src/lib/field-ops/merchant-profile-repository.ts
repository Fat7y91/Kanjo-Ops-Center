import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { EMPTY_MERCHANT_V1_PROFILE, type MerchantV1Profile } from "./types";

/**
 * Tier 4 repository for `app.merchant_v1_profiles`.
 *
 * One row per merchant holding the V1 working fields (address, socials, publish
 * state, VIP flag, Drive folder). Reads degrade to an empty profile while the
 * migration is not deployed; writes stay strict so a toggle is never
 * acknowledged and then silently dropped.
 */

type ProfileRow = {
  actual_address: string;
  facebook_url: string;
  instagram_url: string;
  drive_folder_url: string;
  app_published: boolean;
  vip_menu: boolean;
  updated_at: string | null;
};

const COLUMNS =
  "actual_address,facebook_url,instagram_url,drive_folder_url,app_published,vip_menu,updated_at";

export type MerchantV1Patch = Partial<
  Pick<
    MerchantV1Profile,
    | "actualAddress"
    | "facebookUrl"
    | "instagramUrl"
    | "driveFolderUrl"
    | "appPublished"
    | "vipMenu"
  >
>;

function toProfile(row: ProfileRow): MerchantV1Profile {
  return {
    actualAddress: row.actual_address,
    facebookUrl: row.facebook_url,
    instagramUrl: row.instagram_url,
    driveFolderUrl: row.drive_folder_url,
    appPublished: row.app_published,
    vipMenu: row.vip_menu,
    updatedAt: row.updated_at,
  };
}

function toRow(patch: MerchantV1Patch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.actualAddress !== undefined) row.actual_address = patch.actualAddress;
  if (patch.facebookUrl !== undefined) row.facebook_url = patch.facebookUrl;
  if (patch.instagramUrl !== undefined) row.instagram_url = patch.instagramUrl;
  if (patch.driveFolderUrl !== undefined) {
    row.drive_folder_url = patch.driveFolderUrl;
  }
  if (patch.appPublished !== undefined) row.app_published = patch.appPublished;
  if (patch.vipMenu !== undefined) row.vip_menu = patch.vipMenu;
  row.updated_at = new Date().toISOString();
  return row;
}

export function isMerchantProfilesDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/** The stored working fields, or the empty profile when none is saved yet. */
export async function getMerchantV1Profile(
  merchantId: string,
): Promise<MerchantV1Profile> {
  if (!hasSupabaseConfig()) return EMPTY_MERCHANT_V1_PROFILE;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("merchant_v1_profiles")
    .select(COLUMNS)
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return EMPTY_MERCHANT_V1_PROFILE;
    throw error;
  }
  return data ? toProfile(data as ProfileRow) : EMPTY_MERCHANT_V1_PROFILE;
}

/**
 * Upserts one merchant's working fields.
 *
 * The caller has already checked the per-field capability; this layer only
 * records the columns that were actually supplied, so a socials edit never
 * clears the publish flag and a publish toggle never clears the address.
 */
export async function saveMerchantV1Profile(
  merchantId: string,
  patch: MerchantV1Patch,
  updatedBy: string | null,
): Promise<MerchantV1Profile> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("merchant_v1_profiles")
    .upsert(
      {
        merchant_id: merchantId,
        ...toRow(patch),
        updated_by: updatedBy,
      },
      { onConflict: "merchant_id" },
    )
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return toProfile(data as ProfileRow);
}
