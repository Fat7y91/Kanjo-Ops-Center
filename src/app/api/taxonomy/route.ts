import { NextResponse } from "next/server";

import { authorizeAny } from "@/lib/auth/api";
import { refreshVariantsFromDatabase } from "@/lib/taxonomy/db-variants";
import { taxonomySnapshot } from "@/lib/taxonomy/store";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const { session, response } = await authorizeAny(
    permissionsForModule("/catalog/taxonomy"),
  );
  if (!session) return response;

  await refreshVariantsFromDatabase();
  return NextResponse.json(taxonomySnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
