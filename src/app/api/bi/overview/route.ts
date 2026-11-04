import { NextResponse } from "next/server";

import { authorizeAny } from "@/lib/auth/api";
import { buildBiDataset } from "@/lib/bi/dataset";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Overview dataset.
 *
 * Building this payload joins field ops, catalog, accounts and payroll, which is
 * the most expensive thing a page render can do on the Worker. It lives here so
 * the HTML response stays a shell: the route renders the title block and this
 * island fetches the facts once, after the shell has painted.
 *
 * The gate is `permissionsForModule("/overview")` — the same set the page guard
 * and the sidebar accept, so a client that may open the screen may also load
 * its data.
 */
export async function GET() {
  const { session, response } = await authorizeAny(
    permissionsForModule("/overview"),
  );
  if (!session) return response;

  return NextResponse.json(await buildBiDataset(), {
    headers: { "Cache-Control": "no-store" },
  });
}
