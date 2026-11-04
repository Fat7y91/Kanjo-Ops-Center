import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { setCampaignStatus } from "@/lib/marketing/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type CampaignRouteProps = {
  params: Promise<{ id: string }>;
};

/** Pause, resume or close a campaign. Closed campaigns are terminal. */
export async function PATCH(request: Request, { params }: CampaignRouteProps) {
  const { session, response } = await authorizeAny([
    "create_campaign",
    "record_campaign_results",
  ]);
  if (!session) return response;

  const { id } = await params;

  try {
    const campaign = setCampaignStatus(id, await readJson(request));
    return NextResponse.json({ campaign });
  } catch (error) {
    return apiError(error);
  }
}
