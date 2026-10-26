import { NextResponse } from "next/server";

import { apiError, authorize } from "@/lib/auth/api";
import {
  listCityManagers,
  revokeCityManager,
} from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const { session, response } = await authorize("assign_city_managers");
  if (!session) return response;

  try {
    const { id, userId } = await context.params;
    const city = revokeCityManager(id, userId);
    return NextResponse.json({
      city,
      managers: listCityManagers(city.id),
    });
  } catch (error) {
    return apiError(error);
  }
}
