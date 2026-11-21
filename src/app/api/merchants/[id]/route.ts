import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { getMerchantById, updateMerchantDetails } from "@/lib/field-ops/store";
import { merchantUpdateSchema } from "@/lib/schemas/field-ops";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Manual correction of a merchant's core details.
 *
 * Gated by `edit_merchants`. The merchant must currently sit inside the viewer's
 * city scope, and a city reassignment must land inside that same scope, so an
 * edit cannot move a record out of the operator's reach. Contract state is not
 * editable here — it keeps its dedicated audited workflow.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("edit_merchants");
  if (!session) return response;
  const { id } = await context.params;

  try {
    const input = merchantUpdateSchema.parse(await readJson(request));

    const merchant = await getMerchantById(id);
    const cityScope = await effectiveCityIds(session);
    if (!merchant || !cityScope.includes(merchant.cityId)) {
      return NextResponse.json(
        { error: "التاجر غير موجود.", code: "MERCHANT_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (input.cityId !== undefined && !cityScope.includes(input.cityId)) {
      return NextResponse.json(
        { error: "هذه المدينة خارج نطاق مدنك.", code: "CITY_OUT_OF_SCOPE" },
        { status: 403 },
      );
    }

    const updated = await updateMerchantDetails(id, input);
    return NextResponse.json(
      { merchant: updated },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
