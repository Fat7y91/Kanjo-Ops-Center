import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { EditRequest, TransferRequest } from "./types";

/**
 * Tier 4 repository for `app.transfer_requests` and `app.edit_requests`.
 *
 * Both tables were created by `20261110000000_field_ops_catalogue.sql`. A
 * request is a manager decision record, so losing it to an isolate restart was
 * losing proof that a rep ever asked.
 */

const TRANSFER_COLUMNS =
  "id,merchant_id,merchant_name,from_team,to_team,requested_by,requested_by_name,justification,status,created_at,reviewed_by,reviewed_by_name,reviewed_at,review_note";

const EDIT_COLUMNS =
  "id,merchant_id,merchant_name,requested_by,requested_by_name,reason,status,created_at,reviewed_by,reviewed_by_name,reviewed_at,review_note";

type RequestRow = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  requested_by: string;
  requested_by_name: string;
  status: TransferRequest["status"];
  created_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string;
};

type TransferRow = RequestRow & {
  from_team: string;
  to_team: string;
  justification: string;
};

type EditRow = RequestRow & {
  reason: string;
};

function toTransfer(row: TransferRow): TransferRequest {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    fromTeam: row.from_team,
    toTeam: row.to_team,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    justification: row.justification,
    status: row.status,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by_name,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

function toEdit(row: EditRow): EditRequest {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by_name,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

export function isRequestsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

export async function listTransferRows(): Promise<TransferRequest[]> {
  if (!isRequestsDatabaseConfigured()) return [];
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("transfer_requests")
    .select(TRANSFER_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as TransferRow[]).map(toTransfer);
}

export async function getTransferRow(
  requestId: string,
): Promise<TransferRequest | null> {
  if (!isRequestsDatabaseConfigured()) return null;
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("transfer_requests")
    .select(TRANSFER_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return data ? toTransfer(data as unknown as TransferRow) : null;
}

export async function insertTransfer(
  request: TransferRequest,
): Promise<TransferRequest> {
  requireDatabase();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("transfer_requests")
    .insert({
      id: request.id,
      merchant_id: request.merchantId,
      merchant_name: request.merchantName,
      from_team: request.fromTeam,
      to_team: request.toTeam,
      requested_by: request.requestedBy,
      requested_by_name: request.requestedByName,
      justification: request.justification,
      status: request.status,
      created_at: request.createdAt,
    })
    .select(TRANSFER_COLUMNS)
    .single();
  if (error) throw error;
  return toTransfer(data as unknown as TransferRow);
}

export async function decideTransferRow(
  requestId: string,
  patch: Pick<
    TransferRequest,
    "status" | "reviewedBy" | "reviewedByName" | "reviewedAt" | "reviewNote"
  >,
): Promise<TransferRequest | null> {
  requireDatabase();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("transfer_requests")
    .update({
      status: patch.status,
      reviewed_by: patch.reviewedBy,
      reviewed_by_name: patch.reviewedByName,
      reviewed_at: patch.reviewedAt,
      review_note: patch.reviewNote,
    })
    .eq("id", requestId)
    .select(TRANSFER_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toTransfer(data as unknown as TransferRow) : null;
}

export async function listEditRows(): Promise<EditRequest[]> {
  if (!isRequestsDatabaseConfigured()) return [];
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("edit_requests")
    .select(EDIT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as EditRow[]).map(toEdit);
}

export async function getEditRow(
  requestId: string,
): Promise<EditRequest | null> {
  if (!isRequestsDatabaseConfigured()) return null;
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("edit_requests")
    .select(EDIT_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return data ? toEdit(data as unknown as EditRow) : null;
}

export async function insertEdit(request: EditRequest): Promise<EditRequest> {
  requireDatabase();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("edit_requests")
    .insert({
      id: request.id,
      merchant_id: request.merchantId,
      merchant_name: request.merchantName,
      requested_by: request.requestedBy,
      requested_by_name: request.requestedByName,
      reason: request.reason,
      status: request.status,
      created_at: request.createdAt,
    })
    .select(EDIT_COLUMNS)
    .single();
  if (error) throw error;
  return toEdit(data as unknown as EditRow);
}

export async function decideEditRow(
  requestId: string,
  patch: Pick<
    EditRequest,
    "status" | "reviewedBy" | "reviewedByName" | "reviewedAt" | "reviewNote"
  >,
): Promise<EditRequest | null> {
  requireDatabase();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("edit_requests")
    .update({
      status: patch.status,
      reviewed_by: patch.reviewedBy,
      reviewed_by_name: patch.reviewedByName,
      reviewed_at: patch.reviewedAt,
      review_note: patch.reviewNote,
    })
    .eq("id", requestId)
    .select(EDIT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toEdit(data as unknown as EditRow) : null;
}

function requireDatabase(): void {
  if (!isRequestsDatabaseConfigured()) {
    throw new Error("REQUESTS_UNAVAILABLE: the request database is not connected");
  }
}
