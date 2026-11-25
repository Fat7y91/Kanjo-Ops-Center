import { NextResponse } from "next/server";

import {
  actorFromSession,
  apiError,
  authorizeAny,
  readJson,
} from "@/lib/auth/api";
import { ContractRepositoryError } from "@/lib/contracts/errors";
import {
  amendSignedContract,
  deleteSignedContract,
  reopenSignedContract,
  terminateSignedContract,
} from "@/lib/contracts/governance-store";
import { CONTRACT_GOVERNANCE_INPUT } from "@/lib/contracts/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type RouteProps = { params: Promise<{ id: string }> };

/**
 * Governance actions on an executed contract.
 *
 * Each action maps to its own capability: amending needs `manage_signed_contracts`
 * (or the legacy force-edit grant), reopening needs `manage_signed_contracts`,
 * a permanent delete needs `delete_contracts`. The body is validated before
 * authorization so a malformed request can never reach a write.
 */
const CAPABILITIES = {
  amend: ["manage_signed_contracts", "edit_finalized_contracts"],
  reopen: ["manage_signed_contracts"],
  terminate: [
    "manage_signed_contracts",
    "delete_contracts",
    "cancel_contract",
  ],
  delete: ["delete_contracts"],
} as const;

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const body = CONTRACT_GOVERNANCE_INPUT.parse(await readJson(request));

    const { session, response } = await authorizeAny(CAPABILITIES[body.action]);
    if (!session) return response;
    const actor = actorFromSession(session);

    if (body.action === "amend") {
      const commissionRate = body.commissionRate;
      if (commissionRate == null) {
        throw new ContractRepositoryError(
          "INVALID_ACTION",
          "أدخل نسبة العمولة الجديدة.",
          422,
        );
      }
      const contract = await amendSignedContract(
        id,
        { commissionRate, note: body.note },
        actor,
      );
      return NextResponse.json({ contract });
    }

    if (body.action === "reopen") {
      const contract = await reopenSignedContract(id, body.note, actor);
      return NextResponse.json({ contract });
    }

    if (body.action === "terminate") {
      const contract = await terminateSignedContract(id, body.note, actor);
      return NextResponse.json({ contract });
    }

    const result = await deleteSignedContract(id, actor);
    return NextResponse.json({ deleted: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
