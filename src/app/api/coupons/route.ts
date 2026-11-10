import { NextResponse } from "next/server";

import { apiError, authorize, authorizeAny, readJson } from "@/lib/auth/api";
import {
  createCoupon,
  loadCouponsBoard,
} from "@/lib/coupons/service";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Mirrors the `/coupons` nav module so an opened screen can load its rows. */
const COUPONS_MODULE = permissionsForModule("/coupons");

export async function GET() {
  const { session, response } = await authorizeAny(COUPONS_MODULE);
  if (!session) return response;

  try {
    const coupons = await loadCouponsBoard();
    return NextResponse.json(
      { coupons },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const { session, response } = await authorize("manage_coupons");
  if (!session) return response;

  try {
    const coupon = await createCoupon(await readJson(request));
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
