import { NextResponse } from "next/server";

import {
  apiError,
  actorFromSession,
  authorizeAny,
  readJson,
} from "@/lib/auth/api";
import { taxonomyRejectSchema } from "@/lib/schemas/taxonomy";
import { rejectTaxonomyRequest } from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorizeAny([
    "manage_categories",
    "review_add_requests",
  ]);
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
