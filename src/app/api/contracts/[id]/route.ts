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
 *
 * Sending a draft for signature is part of drafting, so a drafter who holds
 * `draft_contract`/`create_contracts` may advance their own draft; signing and
 * cancelling stay on their dedicated grants. The whole handler, including
 * authorization and body parsing, is guarded so a failure always returns the
 * JSON error envelope instead of an unhandled edge rejection.
 */
export async function PATCH(request: Request, { params }: ContractRouteProps) {
  try {
    const { id } = await params;
    const body = (await readJson(request)) as
      | (ContractEditInput & Partial<ContractActionInput>);

    const action = body.action;
    if (action) {
      const capability =
        action === "sign"
          ? (["sign_contract", "sign_contracts"] as const)
          : action === "cancel"
            ? ([
                "cancel_contract",
                "delete_contracts",
                "manage_signed_contracts",
              ] as const)
            : action === "reopen"
              ? (["manage_signed_contracts"] as const)
              : ([
                  "edit_contract",
                  "edit_contracts",
                  "draft_contract",
                  "create_contracts",
                ] as const);

      const { session, response } = await authorizeAny(capability);
      if (!session) return response;

      const contract = await applyContractAction(
        id,
        { ...body, action },
        { id: session.user.id, name: session.user.name },
      );
      return NextResponse.json({ contract });
    }

    const { session, response } = await authorizeAny([
      "edit_contract",
      "edit_contracts",
    ]);
    if (!session) return response;

    const contract = await editContract(id, body, session.user.id);
    return NextResponse.json({ contract });
  } catch (error) {
    return apiError(error);
  }
}
