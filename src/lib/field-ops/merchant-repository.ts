import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import {
  isUndefinedColumn,
  MERCHANT_COLUMNS as COLUMNS,
  MERCHANT_COLUMNS_WITHOUT_LOGO,
  toMerchant,
  type MerchantRow,
} from "./merchant-mapping";
import type {
  ContractState,
  Merchant,
  MerchantDocument,
  RepOpinion,
  VisitContact,
} from "./types";

/**
 * Tier 4 repository for `app.merchants`.
 *
 * This is the only module that knows the merchant column names. It is the
 * single source of truth: there is no seed fallback. A deployment without a
 * database reads an empty directory rather than fabricated merchants, and every
 * write is rejected loudly instead of being acknowledged and dropped.
 *
 * Created and widened by `20261106000000_merchant_catalog_ssot.sql`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Columns the domain mutates after creation. Kept as a camelCase patch so the
 * call sites stay in domain terms; the mapping to snake_case lives here only.
 */
export type MerchantPatch = Partial<{
  team: string | null;
  contractState: ContractState;
  commissionAmount: number;
  agreedCommission: number | null;
  editUnlocked: boolean;
  documents: MerchantDocument[];
  contact: VisitContact | null;
  opinions: RepOpinion[];
  contactUpdatedAt: string | null;
  lastVisitAt: string | null;
}>;

export class MerchantRepositoryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MerchantRepositoryError";
    this.code = code;
    this.status = status;
  }
}

export function isMerchantsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function toPatchColumns(patch: MerchantPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.team !== undefined) row.team = patch.team;
  if (patch.contractState !== undefined) {
    row.contract_state = patch.contractState;
  }
  if (patch.commissionAmount !== undefined) {
    row.commission_amount = patch.commissionAmount;
  }
  if (patch.agreedCommission !== undefined) {
    row.agreed_commission = patch.agreedCommission;
  }
  if (patch.editUnlocked !== undefined) row.edit_unlocked = patch.editUnlocked;
  if (patch.documents !== undefined) row.documents = patch.documents;
  if (patch.contact !== undefined) row.contact = patch.contact;
  if (patch.opinions !== undefined) row.opinions = patch.opinions;
  if (patch.contactUpdatedAt !== undefined) {
    row.contact_updated_at = patch.contactUpdatedAt;
  }
  if (patch.lastVisitAt !== undefined) row.last_visit_at = patch.lastVisitAt;
  return row;
}

/** Every merchant, alphabetically, as the directory lists them. */
export async function listMerchantRows(): Promise<Merchant[]> {
  if (!isMerchantsDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  let { data, error } = await client
    .schema("app")
    .from("merchants")
    .select(COLUMNS)
    .order("name", { ascending: true });

  if (isUndefinedColumn(error)) {
    ({ data, error } = await client
      .schema("app")
      .from("merchants")
      .select(MERCHANT_COLUMNS_WITHOUT_LOGO)
      .order("name", { ascending: true }));
  }

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as MerchantRow[]).map(toMerchant);
}

export async function getMerchantRow(id: string): Promise<Merchant | null> {
  if (!isMerchantsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  let { data, error } = await client
    .schema("app")
    .from("merchants")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (isUndefinedColumn(error)) {
    ({ data, error } = await client
      .schema("app")
      .from("merchants")
      .select(MERCHANT_COLUMNS_WITHOUT_LOGO)
      .eq("id", id)
      .maybeSingle());
  }

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return data ? toMerchant(data as unknown as MerchantRow) : null;
}

/** A merchant with the given normalised name, for the create-time guard. */
export async function findMerchantByNormalizedName(
  normalizedName: string,
): Promise<Merchant | null> {
  if (!isMerchantsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  let { data, error } = await client
    .schema("app")
    .from("merchants")
    .select(COLUMNS)
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  if (isUndefinedColumn(error)) {
    ({ data, error } = await client
      .schema("app")
      .from("merchants")
      .select(MERCHANT_COLUMNS_WITHOUT_LOGO)
      .eq("normalized_name", normalizedName)
      .maybeSingle());
  }

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return data ? toMerchant(data as unknown as MerchantRow) : null;
}

export type CreateMerchantRow = {
  merchant: Merchant;
  createdBy: string | null;
};

/**
 * Inserts one merchant and returns the stored row.
 *
 * `first_entry_by`/`first_entry_at` are attribution: they are stamped once, at
 * creation, and never touched again, which is what the activation KPI reads.
 */
export async function insertMerchant(
  write: CreateMerchantRow,
): Promise<Merchant> {
  if (!isMerchantsDatabaseConfigured()) {
    throw new MerchantRepositoryError(
      "MERCHANTS_UNAVAILABLE",
      "قاعدة بيانات التجار غير متصلة.",
      503,
    );
  }

  const { merchant, createdBy } = write;
  const attributedBy = createdBy && UUID.test(createdBy) ? createdBy : null;

  const client = getSupabaseServerClient();
  const values = {
    id: merchant.id,
    name: merchant.name,
    normalized_name: merchant.normalizedName,
    vendor_type_id: merchant.vendorTypeId,
    vendor_type: merchant.vendorType,
    team: merchant.team,
    city_id: merchant.cityId,
    target_commission: merchant.targetCommission,
    monthly_value_minor: Math.round(merchant.monthlyValue * 100),
    strategic_notes: merchant.strategicNotes,
    contract_state: merchant.contractState,
    commission_amount: merchant.commissionAmount,
    agreed_commission: merchant.agreedCommission ?? null,
    edit_unlocked: merchant.editUnlocked,
    documents: merchant.documents,
    opinions: merchant.opinions ?? [],
    first_entry_by: attributedBy,
    first_entry_at: attributedBy ? merchant.createdAt : null,
    created_at: merchant.createdAt,
    updated_at: merchant.updatedAt,
  };

  let { data, error } = await client
    .schema("app")
    .from("merchants")
    .insert(values)
    .select(COLUMNS)
    .single();

  /* The row is inserted and returned in one statement, so an undefined-column
   * parse error leaves nothing behind; retrying without the logo is safe. */
  if (isUndefinedColumn(error)) {
    ({ data, error } = await client
      .schema("app")
      .from("merchants")
      .insert(values)
      .select(MERCHANT_COLUMNS_WITHOUT_LOGO)
      .single());
  }

  if (error) {
    if (isUniqueViolation(error)) {
      throw new MerchantRepositoryError(
        "MERCHANT_EXISTS",
        "يوجد تاجر بهذا الاسم بالفعل.",
        409,
      );
    }
    throw error;
  }
  return toMerchant(data as unknown as MerchantRow);
}

/** Applies a partial update and returns the stored row. */
export async function updateMerchantRow(
  id: string,
  patch: MerchantPatch,
): Promise<Merchant | null> {
  if (!isMerchantsDatabaseConfigured()) {
    throw new MerchantRepositoryError(
      "MERCHANTS_UNAVAILABLE",
      "قاعدة بيانات التجار غير متصلة.",
      503,
    );
  }

  const client = getSupabaseServerClient();
  const patchColumns = toPatchColumns(patch);
  let { data, error } = await client
    .schema("app")
    .from("merchants")
    .update(patchColumns)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  /* Update and read are a single statement, so the retry cannot apply the patch
   * twice. This keeps edits working on a deployment whose migration has not
   * landed yet. */
  if (isUndefinedColumn(error)) {
    ({ data, error } = await client
      .schema("app")
      .from("merchants")
      .update(patchColumns)
      .eq("id", id)
      .select(MERCHANT_COLUMNS_WITHOUT_LOGO)
      .maybeSingle());
  }

  if (error) throw error;
  return data ? toMerchant(data as unknown as MerchantRow) : null;
}
