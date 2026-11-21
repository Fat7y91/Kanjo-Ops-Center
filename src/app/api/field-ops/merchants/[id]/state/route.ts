import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { loadMerchantState } from "@/lib/field-ops/state-source";
import { merchantStateSchema } from "@/lib/schemas/field-ops";
import { getMerchantById, setMerchantState } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("edit_contract");
  if (!session) return response;
  const { id } = await context.params;

  try {
    const input = merchantStateSchema.parse(await readJson(request));
    // The `fromState` recorded on the decision is the resolved state, not the
    // column this isolate happens to hold.
    const merchant = await getMerchantById(id);
    const previousState = merchant
      ? await loadMerchantState(merchant)
      : undefined;
    // `setMerchantState` writes the append-only override and the audit report
    // before it returns, and fails the request if either write is rejected.
    const result = await setMerchantState(
      id,
      input.state,
      input.note,
      actorFromSession(session),
      input.agreedCommission ?? null,
      previousState,
    );

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
