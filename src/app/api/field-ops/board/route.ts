import { NextResponse } from "next/server";

import { authorizeAny } from "@/lib/auth/api";
import { buildBoard } from "@/lib/field-ops/board";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Mirrors the `/field-ops` nav module: opening the screen loads its board. */
const FIELD_OPS_MODULE = permissionsForModule("/field-ops");

export async function GET() {
  const { session, response } = await authorizeAny(FIELD_OPS_MODULE);
  if (!session) return response;

  return NextResponse.json(
    { board: await buildBoard(session) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
