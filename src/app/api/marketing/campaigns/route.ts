import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import {
  campaignProgress,
  createCampaign,
  listCampaigns,
} from "@/lib/marketing/store";
import type { CampaignInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const { session, response } = await authorize("manage_marketing_metrics");
  if (!session) return response;

  return NextResponse.json(
    { campaigns: listCampaigns(), progress: campaignProgress() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorize("manage_marketing_metrics");
  if (!session) return response;

  try {
    const campaign = createCampaign(
      (await readJson(request)) as CampaignInput,
      session.user.id,
    );
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
