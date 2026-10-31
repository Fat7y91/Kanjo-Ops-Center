import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import {
  listMarketingEntries,
  recordMarketingEntry,
} from "@/lib/marketing/store";
import type { MarketingEntryInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const { session, response } = await authorize("manage_marketing_metrics");
  if (!session) return response;

  return NextResponse.json(
    { entries: listMarketingEntries() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorize("manage_marketing_metrics");
  if (!session) return response;

  try {
    const entry = recordMarketingEntry(
      (await readJson(request)) as MarketingEntryInput,
      session.user.id,
    );
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
