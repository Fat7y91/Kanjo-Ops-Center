import { NextResponse } from "next/server";

import { apiError, authorizeAny } from "@/lib/auth/api";
import { loadRiderCustodyReceipt } from "@/lib/riders/service";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const RIDERS_MODULE = permissionsForModule("/riders");

type RouteContext = { params: Promise<{ receiptId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { session, response } = await authorizeAny(RIDERS_MODULE);
  if (!session) return response;

  try {
    const { receiptId } = await context.params;
    const receipt = await loadRiderCustodyReceipt(receiptId);
    if (!receipt) {
      return NextResponse.json(
        { error: "إيصال العهدة غير موجود.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { receipt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
