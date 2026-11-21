import { NextResponse } from "next/server";

import { apiError, authorizeAny } from "@/lib/auth/api";
import { loadNextSequence } from "@/lib/riders/service";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const RIDERS_MODULE = permissionsForModule("/riders");

export async function GET(request: Request) {
  const { session, response } = await authorizeAny(RIDERS_MODULE);
  if (!session) return response;

  try {
    const url = new URL(request.url);
    const next = await loadNextSequence({
      governorate: url.searchParams.get("governorate") ?? "",
      city: url.searchParams.get("city") ?? "",
    });
    return NextResponse.json(
      { next },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
