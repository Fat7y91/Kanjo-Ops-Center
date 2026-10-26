import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import {
  assignCityManagers,
  listAssignableManagers,
  listCityManagers,
} from "@/lib/field-ops/store";
import { cityManagerAssignSchema } from "@/lib/schemas/field-ops";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_cities");
  if (!session) return response;

  try {
    const { id } = await context.params;
    return NextResponse.json(
      {
        managers: listCityManagers(id),
        assignable: listAssignableManagers(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
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
    const input = cityManagerAssignSchema.parse(await readJson(request));
    const city = assignCityManagers(id, input.userIds);
    return NextResponse.json({
      city,
      managers: listCityManagers(city.id),
    });
  } catch (error) {
    return apiError(error);
  }
}
