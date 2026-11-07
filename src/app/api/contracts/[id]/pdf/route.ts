import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { apiError, authorizeAny } from "@/lib/auth/api";
import { findContractRow } from "@/lib/contracts/repository";
import { ContractRepositoryError } from "@/lib/contracts/repository";
import { buildContractBody, contractDocumentTitle } from "@/lib/contracts/render/document";
import { renderHtmlToPdf } from "@/lib/contracts/render/pdf";
import { resolveContractDocumentInput } from "@/lib/contracts/render/resolve";
import {
  contractFooterTemplate,
  contractHeaderTemplate,
  wrapContractDocument,
} from "@/lib/contracts/render/shell";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

/**
 * Renders the contract as a V1-faithful PDF.
 *
 * The document is generated from the merchant classification and commission so
 * the legal clauses stay canonical, then stored under
 * `contracts/<id>.pdf` in a private bucket. The row's `storage_path` and
 * `sha256` are updated so a later fetch can serve the exact bytes that were
 * rendered. Page numbers come from Puppeteer's footer template.
 */
export async function POST(_request: Request, { params }: RouteProps) {
  const { id } = await params;
  const { session, response } = await authorizeAny(READ_CAPABILITIES);
  if (!session) return response;

  try {
    const contract = await findContractRow(id);
    if (!contract) {
      throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
    }

    const input = await resolveContractDocumentInput(contract);
    const body = buildContractBody(input);
    const html = wrapContractDocument(contractDocumentTitle(input), body);

    const pdf = await renderHtmlToPdf(html, {
      headerTemplate: contractHeaderTemplate(),
      footerTemplate: contractFooterTemplate(),
    });
    const sha256 = createHash("sha256").update(pdf).digest("hex");

    const path = `contracts/${id}.pdf`;
    const client = getSupabaseServerClient();
    // Persisting the rendered bytes is best-effort: a deployment whose
    // `contract-documents` bucket has not been created yet must still return the
    // PDF the operator asked for, not a 500.
    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (!uploadError) {
      await client
        .schema("app")
        .from("contracts")
        .update({ storage_path: path, sha256 })
        .eq("id", id);
    }

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="contract-${contract.reference}.pdf"`,
        "Cache-Control": "no-store",
        "X-Contract-Sha256": sha256,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
