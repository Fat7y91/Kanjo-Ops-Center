import { NextResponse } from "next/server";

import { authorizeAny } from "@/lib/auth/api";
import { taxonomySnapshot } from "@/lib/taxonomy/store";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const { session, response } = await authorizeAny(
    permissionsForModule("/catalog/taxonomy"),
  );
  if (!session) return response;

  return NextResponse.json(taxonomySnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
