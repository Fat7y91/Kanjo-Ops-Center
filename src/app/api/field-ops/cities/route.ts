import { NextResponse } from "next/server";

import {
  apiError,
  actorFromSession,
  authorize,
  authorizeAny,
  readJson,
} from "@/lib/auth/api";
import { cityCreateSchema } from "@/lib/schemas/field-ops";
import { createCity } from "@/lib/field-ops/store";
import { scopedCities } from "@/lib/city-scope-query";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Mirrors the `/cities` nav module so a screen that opens can load its data. */
const CITY_MODULE = permissionsForModule("/cities");

export async function GET() {
  const { session, response } = await authorizeAny(CITY_MODULE);
  if (!session) return response;

  return NextResponse.json(
    { cities: await scopedCities(session) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorize("add_city");
  if (!session) return response;

  try {
    const input = cityCreateSchema.parse(await readJson(request));
    const city = await createCity(input, actorFromSession(session));
    return NextResponse.json({ city }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
