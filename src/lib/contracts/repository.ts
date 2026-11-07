import "server-only";

import { actorIdOrNull } from "@/lib/db/actor-id";
import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type {
  Contract,
  ContractDraftInput,
  ContractEditInput,
  ContractStatus,
} from "./types";
import { CONTRACT_BASE_COLUMNS, CONTRACT_COLUMNS, toContract, type ContractRow } from "./row";

/**
 * Tier 4 repository for `app.contracts` (`20261109000000_contracts.sql`,
 * widened by `20261117000000_contracts_v2.sql`).
 *
 * This is the only module that knows the column names. Reads degrade to an
 * empty register when the migration is not deployed yet, so the page renders
 * its empty state instead of an error; writes stay strict.
 */

const COLUMNS = CONTRACT_COLUMNS;

export class ContractRepositoryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ContractRepositoryError";
    this.code = code;
    this.status = status;
  }
}

export function isContractsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

export async function listContractRows(): Promise<Contract[]> {
  if (!isContractsDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const read = async (columns: string) =>
    client
      .schema("app")
      .from("contracts")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(500);

  let { data, error } = await read(COLUMNS);
  // The V2 columns (serial/storage/sha256) may not be deployed yet. Fall back to
  // the pre-V2 projection so real rows still render instead of an empty state.
  if (error) {
    if (!isMissingSchemaObject(error)) throw error;
    const fallback = await read(CONTRACT_BASE_COLUMNS);
    if (fallback.error) {
      if (isMissingSchemaObject(fallback.error)) return [];
      throw fallback.error;
    }
    data = fallback.data;
    error = null;
  }
  return ((data ?? []) as unknown as ContractRow[]).map(toContract);
}

export async function findContractRow(id: string): Promise<Contract | null> {
  if (!isContractsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const read = async (columns: string) =>
    client
      .schema("app")
      .from("contracts")
      .select(columns)
      .eq("id", id)
      .maybeSingle();

  let { data, error } = await read(COLUMNS);
  if (error) {
    if (!isMissingSchemaObject(error)) throw error;
    const fallback = await read(CONTRACT_BASE_COLUMNS);
    if (fallback.error) {
      if (isMissingSchemaObject(fallback.error)) return null;
      throw fallback.error;
    }
    data = fallback.data;
    error = null;
  }
  return data ? toContract(data as unknown as ContractRow) : null;
}

/** `CTR-<year>-<sequence>`; the unique index is the final arbiter under races. */
function reference(): string {
  const year = new Date().getUTCFullYear();
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  return `CTR-${year}-${suffix}`;
}

export async function insertContractRow(
  input: ContractDraftInput,
  actorId: string | null,
): Promise<Contract> {
  if (!isContractsDatabaseConfigured()) {
    throw new ContractRepositoryError(
      "STORE_UNAVAILABLE",
      "سجل العقود غير مُفعّل على هذا النشر بعد.",
      503,
    );
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("contracts")
    .insert({
      reference: reference(),
      merchant_id: input.merchantId,
      merchant_name: input.merchantName,
      city_id: input.cityId,
      value_minor: Math.round(input.value * 100),
      currency: input.currency,
      status: "draft",
      signatory: input.signatory,
      body: input.body,
      drafted_by: actorIdOrNull(actorId),
    })
    .select(CONTRACT_BASE_COLUMNS)
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new ContractRepositoryError(
        "STORE_UNAVAILABLE",
        "سجل العقود غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    if (isUniqueViolation(error)) {
      throw new ContractRepositoryError(
        "DUPLICATE_REFERENCE",
        "تعذر توليد رقم عقد فريد. أعد المحاولة.",
        409,
      );
    }
    throw error;
  }
  return toContract(data as unknown as ContractRow);
}

export type ContractPatch = Partial<{
  merchantName: string;
  cityId: string | null;
  valueMinor: number;
  currency: Contract["currency"];
  signatory: string;
  body: string;
}>;

export async function updateContractRow(
  id: string,
  patch: ContractPatch,
  actorId: string | null,
): Promise<Contract | null> {
  if (!isContractsDatabaseConfigured()) {
    throw new ContractRepositoryError(
      "STORE_UNAVAILABLE",
      "سجل العقود غير مُفعّل على هذا النشر بعد.",
      503,
    );
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("contracts")
    .update({ ...patch, edited_by: actorIdOrNull(actorId) })
    .eq("id", id)
    .select(CONTRACT_BASE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new ContractRepositoryError(
        "STORE_UNAVAILABLE",
        "سجل العقود غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }
  return data ? toContract(data as unknown as ContractRow) : null;
}

export async function setContractStatusRow(
  id: string,
  status: ContractStatus,
  actorId: string | null,
  signatory?: string,
): Promise<Contract | null> {
  if (!isContractsDatabaseConfigured()) {
    throw new ContractRepositoryError(
      "STORE_UNAVAILABLE",
      "سجل العقود غير مُفعّل على هذا النشر بعد.",
      503,
    );
  }

  const now = new Date().toISOString();
  const patch =
    status === "signed"
      ? {
          status,
          signed_at: now,
          signed_by: actorIdOrNull(actorId),
          ...(signatory ? { signatory } : {}),
        }
      : status === "cancelled"
        ? { status, cancelled_at: now, cancelled_by: actorIdOrNull(actorId) }
        : { status };

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("contracts")
    .update(patch)
    .eq("id", id)
    .select(CONTRACT_BASE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new ContractRepositoryError(
        "STORE_UNAVAILABLE",
        "سجل العقود غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }
  return data ? toContract(data as unknown as ContractRow) : null;
}
