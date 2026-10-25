import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { cityCreateSchema } from "@/lib/schemas/field-ops";
import { updateCity } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("manage_cities");
  if (!session) return response;
  const { id } = await context.params;

  try {
    const input = cityCreateSchema.parse(await readJson(request));
    const city = updateCity(id, input);
    return NextResponse.json({ city });
  } catch (error) {
    return apiError(error);
  }
}
