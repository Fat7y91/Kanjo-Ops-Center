import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { taxonomyDirectCreateSchema } from "@/lib/schemas/taxonomy";
import { createTaxonomyEntry } from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(request: Request) {
  const { session, response } = await authorize("manage_taxonomy");
  if (!session) return response;

  try {
    const input = taxonomyDirectCreateSchema.parse(await readJson(request));
    const snapshot = createTaxonomyEntry(input, actorFromSession(session));
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
