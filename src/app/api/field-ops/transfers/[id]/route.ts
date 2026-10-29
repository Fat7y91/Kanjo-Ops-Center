import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { decisionSchema } from "@/lib/schemas/field-ops";
import { decideTransferRequest } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("approve_transfers");
  if (!session) return response;
  const { id } = await context.params;

  try {
    const input = decisionSchema.parse(await readJson(request));
    const transfer = decideTransferRequest(
      id,
      input.decision,
      actorFromSession(session),
      input.note,
    );
    return NextResponse.json({ transfer });
  } catch (error) {
    return apiError(error);
  }
}
