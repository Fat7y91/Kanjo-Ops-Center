import { NextResponse } from "next/server";

import { apiError, authorizeAny } from "@/lib/auth/api";
import { loadLocations } from "@/lib/riders/service";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const RIDERS_MODULE = permissionsForModule("/riders");

export async function GET() {
  const { session, response } = await authorizeAny(RIDERS_MODULE);
  if (!session) return response;

  try {
    const locations = await loadLocations();
    return NextResponse.json(
      { locations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
