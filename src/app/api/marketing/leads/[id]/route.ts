import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { updateMarketingLead } from "@/lib/marketing-leads/repository";
import { leadStatusPatchSchema } from "@/lib/marketing-leads/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Desk triage: move a lead along its lifecycle and record notes. */
export async function PATCH(request: Request, context: RouteContext) {
  const { session, response } = await authorize("manage_marketing_leads");
  if (!session) return response;

  const { id } = await context.params;

  try {
    const patch = leadStatusPatchSchema.parse(await readJson(request));
    const lead = await updateMarketingLead(id, patch);
    return NextResponse.json({ lead });
  } catch (error) {
    return apiError(error);
  }
}
