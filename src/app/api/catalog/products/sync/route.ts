import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { catalogRevision, syncProducts } from "@/lib/catalog/store";
import { catalogSyncSchema } from "@/lib/schemas/catalog";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const PRODUCT_CREATE_CAPABILITIES = [
  "create_products",
  "manage_catalog",
] as const;

/**
 * Offline queue drain endpoint.
 *
 * Returns a per-draft result so the client can drop acknowledged rows and keep
 * failures queued. A batch is never rejected wholesale: one invalid product
 * must not block the rep's other drafts.
 */
export async function POST(request: Request) {
  const { session, response } = await authorizeAny([
    ...PRODUCT_CREATE_CAPABILITIES,
  ]);
  if (!session) return response;

  try {
    const { drafts } = catalogSyncSchema.parse(await readJson(request));
    const outcome = syncProducts(drafts);
    return NextResponse.json(
      { ...outcome, revision: catalogRevision() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
