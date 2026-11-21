import { NextResponse } from "next/server";

import { apiError, authorize, authorizeAny } from "@/lib/auth/api";
import { listSocialMetricRowsSince } from "@/lib/marketing/social/repository";
import { buildSocialSummary } from "@/lib/marketing/social/summary";
import {
  refreshSocialMetricsIfStale,
  syncSocialMetrics,
} from "@/lib/marketing/social/sync";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const READ_CAPABILITIES = [
  "view_campaigns",
  "manage_marketing_metrics",
  "manage_platform_settings",
] as const;

const HISTORY_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  const { session, response } = await authorizeAny(READ_CAPABILITIES);
  if (!session) return response;

  try {
    let sync = null;
    try {
      sync = await refreshSocialMetricsIfStale(session.user.id);
    } catch {
      sync = null;
    }

    const rows = await listSocialMetricRowsSince(
      new Date(Date.now() - HISTORY_MS),
    );
    return NextResponse.json(
      { summary: buildSocialSummary(rows), sync },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST() {
  const { session, response } = await authorize("manage_platform_settings");
  if (!session) return response;

  try {
    const sync = await syncSocialMetrics(session.user.id);
    return NextResponse.json({ sync });
  } catch (error) {
    return apiError(error);
  }
}
