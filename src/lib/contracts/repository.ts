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

/**
 * Tier 4 repository for `app.contracts` (`20261109000000_contracts.sql`).
 *
 * This is the only module that knows the column names. Reads degrade to an
 * empty register when the migration is not deployed yet, so the page renders
 * its empty state instead of an error; writes stay strict.
 */

const COLUMNS =
  "id,reference,merchant_id,merchant_name,city_id,value_minor,currency,status,signatory,body,signed_at,cancelled_at,created_at,updated_at";

type ContractRow = {
  id: string;
  reference: string;
  merchant_id: string;
  merchant_name: string;
  city_id: string | null;
  value_minor: number | string;
  currency: Contract["currency"];
  status: ContractStatus;
  signatory: string;
  body: string;
  signed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

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

function toContract(row: ContractRow): Contract {
  return {
    id: row.id,
    reference: row.reference,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    cityId: row.city_id,
    value: Number(row.value_minor) / 100,
    currency: row.currency,
    status: row.status,
    signatory: row.signatory,
    body: row.body,
    signedAt: row.signed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listContractRows(): Promise<Contract[]> {
  if (!isContractsDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("contracts")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as ContractRow[]).map(toContract);
}

export async function findContractRow(id: string): Promise<Contract | null> {
  if (!isContractsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("contracts")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
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
    .select(COLUMNS)
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
    .select(COLUMNS)
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
    .select(COLUMNS)
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
