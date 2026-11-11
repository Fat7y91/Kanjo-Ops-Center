import { NextResponse } from "next/server";

import { authorizeAny } from "@/lib/auth/api";
import { buildMerchantRows } from "@/lib/field-ops/merchant-rows";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Directory rows for the merchants screen.
 *
 * `/api/field-ops/merchants` answers the visit engine's picker: merchant
 * identity plus the resolved agreement state. The directory needs a different
 * projection — agreed commission rate, live journal balance, city name,
 * ownership label — so it has its own read rather than a flag on the other one
 * that would make both payloads carry fields only one caller renders.
 *
 * The gate is the `/merchants` nav module, the same capability set the page
 * requires, so the endpoint cannot be opened by a session the page would
 * redirect.
 */
const MERCHANT_DIRECTORY_CAPABILITIES = permissionsForModule("/merchants");

export async function GET() {
  const { session, response } = await authorizeAny(
    MERCHANT_DIRECTORY_CAPABILITIES,
  );
  if (!session) return response;

  return NextResponse.json(
    { rows: await buildMerchantRows(session) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
