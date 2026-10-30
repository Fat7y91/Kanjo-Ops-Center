import { NextResponse } from "next/server";

import { apiError, authorize } from "@/lib/auth/api";
import { isGlobalSession } from "@/lib/city-scope-query";
import { getCityById } from "@/lib/field-ops/store";
import { assertCanGovern, RbacDeniedError } from "@/lib/rbac/management";
import { getUserById } from "@/lib/rbac/users";
import {
  listCityManagers,
  revokeCityManager,
} from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const { session, response } = await authorize("assign_city_managers");
  if (!session) return response;

  try {
    const { id, userId } = await context.params;
    if (!getCityById(id)) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }
    if (!isGlobalSession(session) && !session.accessibleCities.includes(id)) {
      throw new RbacDeniedError(
        "SCOPE_DENIED",
        "هذه المدينة خارج نطاق مدنك.",
      );
    }
    const target = await getUserById(userId);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    assertCanGovern(session, target);

    const city = await revokeCityManager(id, userId);
    return NextResponse.json({
      city,
      managers: await listCityManagers(city.id),
    });
  } catch (error) {
    if (error instanceof RbacDeniedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error);
  }
}
