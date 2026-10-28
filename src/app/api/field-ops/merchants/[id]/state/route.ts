import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { merchantStateSchema } from "@/lib/schemas/field-ops";
import { setMerchantState } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("manage_merchant_state");
  if (!session) return response;
  const { id } = await context.params;

  try {
    const input = merchantStateSchema.parse(await readJson(request));
    const result = setMerchantState(
      id,
      input.state,
      input.note,
      actorFromSession(session),
      input.agreedCommission ?? null,
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
