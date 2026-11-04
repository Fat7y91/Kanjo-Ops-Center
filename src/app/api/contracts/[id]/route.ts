import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { applyContractAction, editContract } from "@/lib/contracts/store";
import type { ContractActionInput, ContractEditInput } from "@/lib/contracts/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type ContractRouteProps = {
  params: Promise<{ id: string }>;
};

/**
 * Contract mutation.
 *
 * The body decides which capability is required: an `action` needs the key for
 * that transition (`sign_contract` is never satisfied by `edit_contract`), while
 * a field patch needs an editing capability.
 */
export async function PATCH(request: Request, { params }: ContractRouteProps) {
  const { id } = await params;
  const body = (await readJson(request)) as
    | (ContractEditInput & Partial<ContractActionInput>);

  const action = body.action;
  if (action) {
    const capability =
      action === "sign"
        ? (["sign_contract", "sign_contracts"] as const)
        : action === "cancel"
          ? (["cancel_contract", "delete_contracts"] as const)
          : (["edit_contract", "edit_contracts"] as const);

    const { session, response } = await authorizeAny(capability);
    if (!session) return response;

    try {
      const contract = await applyContractAction(
        id,
        { ...body, action },
        session.user.id,
      );
      return NextResponse.json({ contract });
    } catch (error) {
      return apiError(error);
    }
  }

  const { session, response } = await authorizeAny([
    "edit_contract",
    "edit_contracts",
  ]);
  if (!session) return response;

  try {
    const contract = await editContract(id, body, session.user.id);
    return NextResponse.json({ contract });
  } catch (error) {
    return apiError(error);
  }
}
