import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import {
  MERCHANT_COLUMNS as COLUMNS,
  nextMerchantProjection,
  toMerchant,
  type MerchantRow,
} from "./merchant-mapping";
import { toPatchColumns as patchColumns } from "./merchant-patch";
import type { MerchantPatch } from "./merchant-patch";
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
 * Columns the domain mutates after creation live in `merchant-patch.ts`, next to
 * the read-side mapping, so the repository stays a thin I/O shell.
 */
export type { MerchantPatch } from "./merchant-patch";

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
  return patchColumns(patch);
}

type RowsResponse = {
  data: unknown;
  error: unknown;
};

/**
 * Runs a select-bearing query, dropping only the image column the server says
 * is missing, then retries.
 *
 * A statement that fails on an undefined column is rejected at parse time, so
 * nothing is written and retrying is safe for inserts and updates alike. This
 * keeps the directory working on a deployment that has `logo_url` but not yet
 * `cover_url` (and vice versa) without blanking both.
 */
async function withImageColumnFallback(
  run: (columns: string) => PromiseLike<RowsResponse>,
): Promise<RowsResponse> {
  let columns = COLUMNS;
  let result = await run(columns);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const next = nextMerchantProjection(columns, result.error);
    if (!next) break;
    columns = next;
    result = await run(columns);
  }
  return result;
}

/** Every merchant, alphabetically, as the directory lists them. */
export async function listMerchantRows(): Promise<Merchant[]> {
  if (!isMerchantsDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await withImageColumnFallback((columns) =>
    client
      .schema("app")
      .from("merchants")
      .select(columns)
      .order("name", { ascending: true }),
  );

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as MerchantRow[]).map(toMerchant);
}

export async function getMerchantRow(id: string): Promise<Merchant | null> {
  if (!isMerchantsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await withImageColumnFallback((columns) =>
    client
      .schema("app")
      .from("merchants")
      .select(columns)
      .eq("id", id)
      .maybeSingle(),
  );

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
  const { data, error } = await withImageColumnFallback((columns) =>
    client
      .schema("app")
      .from("merchants")
      .select(columns)
      .eq("normalized_name", normalizedName)
      .maybeSingle(),
  );

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

  /* The row is inserted and returned in one statement, so an undefined-column
   * parse error leaves nothing behind; retrying without the missing image
   * column is safe. */
  const { data, error } = await withImageColumnFallback((columns) =>
    client
      .schema("app")
      .from("merchants")
      .insert(values)
      .select(columns)
      .single(),
  );

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

  /* Update and read are a single statement, so the retry cannot apply the patch
   * twice. This keeps edits working on a deployment whose migration has not
   * landed yet. */
  const { data, error } = await withImageColumnFallback((columns) =>
    client
      .schema("app")
      .from("merchants")
      .update(patchColumns)
      .eq("id", id)
      .select(columns)
      .maybeSingle(),
  );

  if (error) throw error;
  return data ? toMerchant(data as unknown as MerchantRow) : null;
}
