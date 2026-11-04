import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

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

const COLUMNS = [
  "id",
  "name",
  "normalized_name",
  "vendor_type_id",
  "vendor_type",
  "team",
  "city_id",
  "target_commission",
  "monthly_value_minor",
  "strategic_notes",
  "contract_state",
  "commission_amount",
  "agreed_commission",
  "edit_unlocked",
  "documents",
  "contact",
  "opinions",
  "contact_updated_at",
  "last_visit_at",
  "created_at",
  "updated_at",
].join(",");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MerchantRow = {
  id: string;
  name: string;
  normalized_name: string;
  vendor_type_id: number | null;
  vendor_type: string;
  team: string | null;
  city_id: string;
  target_commission: number | string;
  monthly_value_minor: number | string;
  strategic_notes: string;
  contract_state: ContractState;
  commission_amount: number | string;
  agreed_commission: number | string | null;
  edit_unlocked: boolean;
  documents: MerchantDocument[] | null;
  contact: VisitContact | null;
  opinions: RepOpinion[] | null;
  contact_updated_at: string | null;
  last_visit_at: string | null;
  created_at: string;
  updated_at: string;
};

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

/**
 * `monthly_value_minor` is stored in minor units, but the domain works in major
 * units. Converting at the boundary keeps every calculation in one scale.
 */
function toMerchant(row: MerchantRow): Merchant {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    vendorTypeId: Number(row.vendor_type_id ?? 0),
    vendorType: row.vendor_type,
    team: row.team,
    cityId: row.city_id,
    targetCommission: Number(row.target_commission),
    monthlyValue: Number(row.monthly_value_minor) / 100,
    strategicNotes: row.strategic_notes,
    contractState: row.contract_state,
    commissionAmount: Number(row.commission_amount),
    agreedCommission:
      row.agreed_commission == null ? null : Number(row.agreed_commission),
    editUnlocked: row.edit_unlocked,
    documents: Array.isArray(row.documents) ? row.documents : [],
    contact: row.contact ?? null,
    opinions: Array.isArray(row.opinions) ? row.opinions : [],
    contactUpdatedAt: row.contact_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastVisitAt: row.last_visit_at,
  };
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
  const { data, error } = await client
    .schema("app")
    .from("merchants")
    .select(COLUMNS)
    .order("name", { ascending: true });

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as MerchantRow[]).map(toMerchant);
}

export async function getMerchantRow(id: string): Promise<Merchant | null> {
  if (!isMerchantsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("merchants")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

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
  const { data, error } = await client
    .schema("app")
    .from("merchants")
    .select(COLUMNS)
    .eq("normalized_name", normalizedName)
    .maybeSingle();

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
  const { data, error } = await client
    .schema("app")
    .from("merchants")
    .insert({
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
    })
    .select(COLUMNS)
    .single();

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
  const { data, error } = await client
    .schema("app")
    .from("merchants")
    .update(toPatchColumns(patch))
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? toMerchant(data as unknown as MerchantRow) : null;
}
