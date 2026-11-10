import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { deleteCoupon, updateCoupon } from "@/lib/coupons/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { session, response } = await authorize("manage_coupons");
  if (!session) return response;

  try {
    const { id } = await context.params;
    const coupon = await updateCoupon(id, await readJson(request));
    return NextResponse.json({ coupon });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { session, response } = await authorize("manage_coupons");
  if (!session) return response;

  try {
    const { id } = await context.params;
    await deleteCoupon(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
