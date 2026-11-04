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
  const { session, response } = await authorize("view_campaigns");
  if (!session) return response;

  try {
    const [campaigns, progress] = await Promise.all([
      listCampaigns(),
      campaignProgress(),
    ]);
    return NextResponse.json(
      { campaigns, progress },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const { session, response } = await authorize("create_campaign");
  if (!session) return response;

  try {
    const campaign = await createCampaign(
      (await readJson(request)) as CampaignInput,
      session.user.id,
    );
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
