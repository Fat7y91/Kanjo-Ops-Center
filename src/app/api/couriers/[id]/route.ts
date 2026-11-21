import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import {
  deleteCourier,
  updateCourier,
} from "@/lib/couriers/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { session, response } = await authorize("manage_couriers");
  if (!session) return response;

  try {
    const { id } = await context.params;
    const courier = await updateCourier(id, await readJson(request));
    return NextResponse.json({ courier });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { session, response } = await authorize("manage_couriers");
  if (!session) return response;

  try {
    const { id } = await context.params;
    await deleteCourier(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
