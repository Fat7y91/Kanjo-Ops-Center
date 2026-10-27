import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth/api";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { visitCountFor } from "@/lib/field-ops/store";
import { searchMerchants } from "@/lib/search/merchant-search";

export const dynamic = "force-dynamic";

/**
 * Global merchant search for the Visit Engine.
 *
 * Deliberately searches the ENTIRE merchant database within the rep's city
 * scope, not just today's assigned tasks, so a rep can start an unplanned
 * visit for any merchant on the fly.
 */
export async function GET(request: Request) {
  const { session, response } = await authorize("view_field_ops");
  if (!session) return response;

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = searchMerchants(
    query,
    session.user.team,
    20,
    effectiveCityIds(session),
  ).map((result) => ({
    ...result,
    visitCount: visitCountFor(result.merchant.id),
  }));

  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
