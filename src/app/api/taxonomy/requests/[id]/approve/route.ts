import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { taxonomyApproveSchema } from "@/lib/schemas/taxonomy";
import { approveTaxonomyRequest } from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("manage_taxonomy");
  if (!session) return response;

  try {
    const { id } = await context.params;
    const input = taxonomyApproveSchema.parse(await readJson(request));
    const result = approveTaxonomyRequest(
      id,
      input.dashboardId,
      actorFromSession(session),
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
