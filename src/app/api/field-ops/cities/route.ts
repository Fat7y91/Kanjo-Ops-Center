import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { cityCreateSchema } from "@/lib/schemas/field-ops";
import { createCity, listCities } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, response } = await authorize("view_cities");
  if (!session) return response;

  return NextResponse.json(
    { cities: listCities() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorize("create_city");
  if (!session) return response;

  try {
    const input = cityCreateSchema.parse(await readJson(request));
    const city = createCity(input, actorFromSession(session));
    return NextResponse.json({ city }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
