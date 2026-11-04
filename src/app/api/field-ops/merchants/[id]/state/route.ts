import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { persistStateOverride } from "@/lib/field-ops/merchant-state-repository";
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
    const result = await setMerchantState(
      id,
      input.state,
      input.note,
      actorFromSession(session),
      input.agreedCommission ?? null,
      previousState,
    );

    // The decision is recorded in `app.merchant_state_overrides` before the
    // route acknowledges it. Without this the manager's decision lived only in
    // the isolate that served the request and vanished with it, while every
    // other worker kept showing the previous state.
    const persisted = await persistStateOverride(
      result.override,
      session.user.id,
    );

    return NextResponse.json({
      ...result,
      durable: persisted === "stored",
    });
  } catch (error) {
    return apiError(error);
  }
}
