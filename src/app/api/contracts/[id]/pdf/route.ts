import { NextResponse } from "next/server";

import { apiError, authorizeAny } from "@/lib/auth/api";
import { findContractRow } from "@/lib/contracts/repository";
import { ContractRepositoryError } from "@/lib/contracts/repository";
import { renderContractPdf } from "@/lib/contracts/render/pdf/render";
import { resolveContractDocumentInput } from "@/lib/contracts/render/resolve";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const READ_CAPABILITIES = [
  "view_contracts",
  "draft_contract",
  "create_contracts",
  "edit_contract",
  "edit_contracts",
  "sign_contract",
  "sign_contracts",
  "cancel_contract",
  "delete_contracts",
] as const;

const BUCKET = "contract-documents";

type RouteProps = { params: Promise<{ id: string }> };

/** Hex-encodes a digest buffer using Web Crypto (available on the edge runtime). */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Renders the contract as a V1-faithful PDF on the edge runtime.
 *
 * The document is generated with `@react-pdf/renderer` from the merchant
 * classification and commission so the legal clauses stay canonical, then
 * stored under `contracts/<id>.pdf` in a private bucket. The row's
 * `storage_path` and `sha256` are updated so a later fetch can serve the exact
 * bytes that were rendered.
 *
 * `GET` is the preview/print path: it renders and returns the same bytes inline
 * without persisting, so an operator can read a contract before signing it.
 * `POST` is the generate/download path and records the fingerprints.
 */
async function renderResponse(id: string, persist: boolean): Promise<NextResponse> {
  const contract = await findContractRow(id);
  if (!contract) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }

  const input = await resolveContractDocumentInput(contract);
  const bytes = await renderContractPdf(input);
  const sha256 = await sha256Hex(bytes);

  if (persist) {
    const path = `contracts/${id}.pdf`;
    const client = getSupabaseServerClient();
    // Persisting the rendered bytes is best-effort: a deployment whose
    // `contract-documents` bucket has not been created yet must still return the
    // PDF the operator asked for, not a 500.
    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (!uploadError) {
      await client
        .schema("app")
        .from("contracts")
        .update({ storage_path: path, sha256 })
        .eq("id", id);
    }
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="contract-${contract.reference}.pdf"`,
      "Cache-Control": "no-store",
      "X-Contract-Sha256": sha256,
    },
  });
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { id } = await params;
  const { session, response } = await authorizeAny(READ_CAPABILITIES);
  if (!session) return response;

  try {
    return await renderResponse(id, false);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(_request: Request, { params }: RouteProps) {
  const { id } = await params;
  const { session, response } = await authorizeAny(READ_CAPABILITIES);
  if (!session) return response;

  try {
    return await renderResponse(id, true);
  } catch (error) {
    return apiError(error);
  }
}
