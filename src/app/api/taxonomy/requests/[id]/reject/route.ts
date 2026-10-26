import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { taxonomyRejectSchema } from "@/lib/schemas/taxonomy";
import { rejectTaxonomyRequest } from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("manage_taxonomy");
  if (!session) return response;

  try {
    const { id } = await context.params;
    const input = taxonomyRejectSchema.parse(await readJson(request));
    const rejected = rejectTaxonomyRequest(
      id,
      input.reason,
      actorFromSession(session),
    );
    return NextResponse.json({ request: rejected });
  } catch (error) {
    return apiError(error);
  }
}
