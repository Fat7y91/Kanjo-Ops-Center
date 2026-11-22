import "server-only";

import { NextResponse } from "next/server";

import { isCatalogEligibleContract } from "@/lib/catalog/types";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { getMerchantById } from "@/lib/field-ops/store";
import type { Merchant } from "@/lib/field-ops/types";
import type { ActiveSession } from "@/lib/rbac/types";

export type AutopilotMerchantResult =
  | { merchant: Merchant; response: null }
  | { merchant: null; response: NextResponse };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Autopilot writes to any active merchant inside the session's city scope and
 * behind an eligible contract, mirroring the manual create path. The workbook
 * parser still applies pharmacy-only deduplication when the vendor type is a
 * pharmacy; every other type uses the generic smart-column mapper.
 */
export async function resolveAutopilotMerchant(
  session: ActiveSession,
  merchantId: string,
): Promise<AutopilotMerchantResult> {
  const merchant = await getMerchantById(merchantId);
  if (!merchant || merchant.archivedAt) {
    return { merchant: null, response: fail("التاجر غير موجود.", 404) };
  }
  const allowed = new Set(await effectiveCityIds(session));
  if (!allowed.has(merchant.cityId)) {
    return { merchant: null, response: fail("التاجر غير موجود.", 404) };
  }

  if (!isCatalogEligibleContract(merchant.contractState)) {
    return {
      merchant: null,
      response: fail(
        "لا يمكن إضافة منتجات إلا لتاجر بعقد نهائي أو موقّع.",
        422,
      ),
    };
  }
  return { merchant, response: null };
}
