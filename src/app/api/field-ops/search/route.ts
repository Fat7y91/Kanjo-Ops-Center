import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth/api";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { searchMerchants } from "@/lib/search/merchant-search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { session, response } = await authorize("view_field_ops");
  if (!session) return response;

  const query = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json(
    {
      results: searchMerchants(
        query,
        session.user.team,
        20,
        effectiveCityIds(session),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
