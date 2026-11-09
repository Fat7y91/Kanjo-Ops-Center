import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import type { ContractTerms } from "@/lib/contracts/draft-editor";
import { findContractRow } from "@/lib/contracts/repository";
import { getEditableTerms, updateContractTerms } from "@/lib/contracts/terms-store";
import type { ActiveSession } from "@/lib/rbac/types";

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
  "edit_finalized_contracts",
] as const;

const WRITE_CAPABILITIES = [
  "edit_contract",
  "edit_contracts",
  "draft_contract",
  "create_contracts",
  "edit_finalized_contracts",
] as const;

type RouteProps = { params: Promise<{ id: string }> };

function canForceEdit(session: ActiveSession): boolean {
  return session.permissions.includes("edit_finalized_contracts");
}

/**
 * Contract terms endpoint.
 *
 * `GET` returns the stored structured terms (clauses, commission lines and
 * section overrides) so the editor can hydrate; it is gated only by read
 * capability, so a finalised contract can still be previewed. `PUT` replaces the
 * terms wholesale.
 *
 * Writes require an editing capability, and editing a *finalised* contract
 * additionally requires `edit_finalized_contracts`; that state rule is enforced
 * in `updateContractTerms`, which re-reads the contract before writing.
 */
export async function GET(_request: Request, { params }: RouteProps) {
  const { id } = await params;
  const { session, response } = await authorizeAny(READ_CAPABILITIES);
  if (!session) return response;

  try {
    const contract = await findContractRow(id);
    if (!contract) {
      return NextResponse.json(
        { error: "العقد غير موجود.", code: "CONTRACT_NOT_FOUND" },
        { status: 404 },
      );
    }
    const terms = await getEditableTerms(contract);
    return NextResponse.json({ contract, terms });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteProps) {
  const { id } = await params;
  const { session, response } = await authorizeAny(WRITE_CAPABILITIES);
  if (!session) return response;

  const body = (await readJson(request)) as { terms?: ContractTerms };
  if (!body.terms || !Array.isArray(body.terms.clauses)) {
    return NextResponse.json(
      { error: "بيانات شروط العقد غير مكتملة.", code: "VALIDATION" },
      { status: 422 },
    );
  }

  try {
    const terms = await updateContractTerms(id, body.terms, {
      canForceEdit: canForceEdit(session),
    });
    return NextResponse.json({ terms });
  } catch (error) {
    return apiError(error);
  }
}
