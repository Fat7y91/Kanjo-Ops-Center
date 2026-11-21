import { NextResponse } from "next/server";

import { apiError, authorize, authorizeAny, readJson } from "@/lib/auth/api";
import { createCourier, loadCouriersBoard } from "@/lib/couriers/service";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Mirrors the `/couriers` nav module so an opened screen can load its rows. */
const COURIERS_MODULE = permissionsForModule("/couriers");

export async function GET() {
  const { session, response } = await authorizeAny(COURIERS_MODULE);
  if (!session) return response;

  try {
    const couriers = await loadCouriersBoard();
    return NextResponse.json(
      { couriers },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const { session, response } = await authorize("manage_couriers");
  if (!session) return response;

  try {
    const courier = await createCourier(await readJson(request));
    return NextResponse.json({ courier }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
