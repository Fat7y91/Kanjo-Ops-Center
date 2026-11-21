import { NextResponse } from "next/server";

import { apiError, authorizeAny } from "@/lib/auth/api";
import { lookupRider } from "@/lib/riders/service";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const RIDERS_MODULE = permissionsForModule("/riders");

export async function GET(request: Request) {
  const { session, response } = await authorizeAny(RIDERS_MODULE);
  if (!session) return response;

  try {
    const url = new URL(request.url);
    const rider = await lookupRider({
      nationalId: url.searchParams.get("nationalId") ?? "",
    });
    return NextResponse.json(
      { rider },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
