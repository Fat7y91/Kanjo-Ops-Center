import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { taxonomyRequestCreateSchema } from "@/lib/schemas/taxonomy";
import {
  createTaxonomyRequest,
  listTaxonomyRequests,
  taxonomyRevision,
} from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const { session, response } = await authorize("manage_categories");
  if (!session) return response;

  return NextResponse.json(
    { requests: listTaxonomyRequests(), revision: taxonomyRevision() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorize("review_add_requests");
  if (!session) return response;

  try {
    const input = taxonomyRequestCreateSchema.parse(await readJson(request));
    const created = createTaxonomyRequest(input, actorFromSession(session));
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
