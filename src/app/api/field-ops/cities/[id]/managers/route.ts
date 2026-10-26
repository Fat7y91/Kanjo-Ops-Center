import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { isGlobalSession } from "@/lib/city-scope-query";
import {
  assignCityManagers,
  getCityById,
  listAssignableManagers,
  listCityManagers,
} from "@/lib/field-ops/store";
import {
  filterGovernableUsers,
  toClearanceActor,
} from "@/lib/rbac/hierarchy";
import { assertCanGovern, RbacDeniedError } from "@/lib/rbac/management";
import { getUserById } from "@/lib/rbac/users";
import { cityManagerAssignSchema } from "@/lib/schemas/field-ops";

export const dynamic = "force-dynamic";

function deniedResponse(error: unknown) {
  if (error instanceof RbacDeniedError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return apiError(error);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_cities");
  if (!session) return response;

  try {
    const { id } = await context.params;
    if (!getCityById(id)) {
      throw new RbacDeniedError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
    }
    if (!isGlobalSession(session) && !session.accessibleCities.includes(id)) {
      throw new RbacDeniedError(
        "SCOPE_DENIED",
        "هذه المدينة خارج نطاق مدنك.",
      );
    }
    const actor = toClearanceActor(session);
    return NextResponse.json(
      {
        managers: listCityManagers(id),
        assignable: filterGovernableUsers(actor, listAssignableManagers()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return deniedResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("assign_city_managers");
  if (!session) return response;

  try {
    const { id } = await context.params;
    if (!getCityById(id)) {
      throw new RbacDeniedError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
    }
    if (!isGlobalSession(session) && !session.accessibleCities.includes(id)) {
      throw new RbacDeniedError(
        "SCOPE_DENIED",
        "هذه المدينة خارج نطاق مدنك.",
      );
    }

    const input = cityManagerAssignSchema.parse(await readJson(request));

    for (const userId of input.userIds) {
      const target = getUserById(userId);
      if (!target) {
        throw new RbacDeniedError(
          "USER_NOT_FOUND",
          "أحد المشغّلين المحددين غير موجود.",
          404,
        );
      }
      assertCanGovern(session, target);
    }

    const city = assignCityManagers(id, input.userIds);
    return NextResponse.json({
      city,
      managers: listCityManagers(city.id),
    });
  } catch (error) {
    return deniedResponse(error);
  }
}
