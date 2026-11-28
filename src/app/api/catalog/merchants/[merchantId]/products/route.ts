import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { apiError, authorizePermissionOrClearance } from "@/lib/auth/api";
import { clearMerchantCatalog } from "@/lib/catalog/clear-catalog";
import {
  bumpRevision,
  catalogRevision,
  CatalogError,
} from "@/lib/catalog/store";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { getMerchantById } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** The executive/admin tier, mirroring the finance-rank surfaces. */
const CATALOG_CLEAR_CLEARANCE = 4;

/**
 * Clears one merchant's entire catalog.
 *
 * Only `app.catalog_products` rows whose `merchant_id` matches are removed; the
 * merchant record, its orders (`operation_logs`) and every journal entry are
 * untouched. The delete is gated by `delete_catalog` or executive clearance and
 * the merchant must fall inside the viewer's city scope.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ merchantId: string }> },
) {
  const { session, response } = await authorizePermissionOrClearance(
    "delete_catalog",
    CATALOG_CLEAR_CLEARANCE,
  );
  if (!session) return response;

  try {
    const { merchantId } = await context.params;
    const merchant = await getMerchantById(merchantId);
    const cityScope = await effectiveCityIds(session);
    if (!merchant || !cityScope.includes(merchant.cityId)) {
      throw new CatalogError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
    }

    const deletedCount = await clearMerchantCatalog(merchant.id);
    bumpRevision();

    /* The catalog screens and the BI readiness card are force-dynamic, but the
     * explicit invalidation keeps any router cache from serving a stale count. */
    revalidatePath("/catalog");
    revalidatePath(`/catalog/${merchant.id}`);
    revalidatePath("/overview");

    return NextResponse.json(
      { ok: true, deletedCount, revision: catalogRevision() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
