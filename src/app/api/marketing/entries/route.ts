import { NextResponse } from "next/server";

import {
  apiError,
  authorize,
  authorizeAny,
  readJson,
} from "@/lib/auth/api";
import {
  listMarketingEntries,
  recordMarketingEntry,
} from "@/lib/marketing/store";
import type { MarketingEntryInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(request: Request) {
  const { session, response } = await authorizeAny([
    "view_campaigns",
    "view_marketing_logs",
  ]);
  if (!session) return response;

  const campaignId = new URL(request.url).searchParams.get("campaignId");

  try {
    return NextResponse.json(
      { entries: await listMarketingEntries(campaignId || undefined) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const { session, response } = await authorize("record_campaign_results");
  if (!session) return response;

  try {
    const entry = await recordMarketingEntry(
      (await readJson(request)) as MarketingEntryInput,
      session.user.id,
    );
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
