import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { transferRequestSchema } from "@/lib/schemas/field-ops";
import { createTransferRequest } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("request_transfers");
  if (!session) return response;
  const { id } = await context.params;

  try {
    const input = transferRequestSchema.parse(await readJson(request));
    const transfer = createTransferRequest(
      id,
      input.justification,
      actorFromSession(session),
    );
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
