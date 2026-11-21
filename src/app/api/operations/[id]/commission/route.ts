import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { editOperationCommission } from "@/lib/operations/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Overrides the commission rate on a single order.
 *
 * The database recomputes `order_value × rate / 100`, rewrites that order's
 * journal lines and leaves every other order for the merchant untouched.
 * Gated by `manage_commission_rates`.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("manage_commission_rates");
  if (!session) return response;

  try {
    const { id } = await context.params;
    const operation = await editOperationCommission(
      id,
      await readJson(request),
      session.user.id,
    );
    return NextResponse.json(
      { operation },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
