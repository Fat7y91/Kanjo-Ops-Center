import { NextResponse } from "next/server";

import {
  apiError,
  actorFromSession,
  authorizeAny,
  readJson,
} from "@/lib/auth/api";
import { taxonomyApproveSchema } from "@/lib/schemas/taxonomy";
import { markTaxonomyRequestAdded } from "@/lib/taxonomy/store";

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
    const input = taxonomyApproveSchema.parse(await readJson(request));
    const result = markTaxonomyRequestAdded(
      id,
      input.dashboardId,
      actorFromSession(session),
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
