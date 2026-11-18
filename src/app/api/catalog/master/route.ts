import { NextResponse } from "next/server";

import { authorizeAny } from "@/lib/auth/api";
import { searchMasterCatalogProducts } from "@/lib/catalog/master-catalog";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Same read capabilities as the catalog screen that opens the picker. */
const CATALOG_READ_CAPABILITIES = permissionsForModule("/catalog");

/**
 * Serves ranked suggestions from the V1 master catalog.
 *
 * The client debounces typing and aborts superseded requests. Short queries are
 * rejected here as well as in the UI so a stray request never pays the cost of
 * ranking the whole snapshot.
 */
export async function GET(request: Request) {
  const { session, response } = await authorizeAny(CATALOG_READ_CAPABILITIES);
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const requested = Number(params.get("limit"));
  const limit = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), 30)
    : 20;

  try {
    const items = await searchMasterCatalogProducts(query, limit);
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "تعذر تحميل الكتالوج المرجعي." },
      { status: 503 },
    );
  }
}
