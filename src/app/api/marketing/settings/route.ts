import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import {
  listPlatformSettings,
  updatePlatformSettings,
} from "@/lib/marketing/store";
import type { PlatformSettingsInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const { session, response } = await authorize("manage_marketing_metrics");
  if (!session) return response;

  return NextResponse.json(
    { settings: listPlatformSettings() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Saving with `enabled: true` runs the platform credential verifier. A key that
 * does not match the network's format is rejected before any row is written, so
 * the sync switch can never report "connected" for an unverified credential.
 */
export async function PUT(request: Request) {
  const { session, response } = await authorize("manage_marketing_metrics");
  if (!session) return response;

  try {
    const settings = updatePlatformSettings(
      (await readJson(request)) as PlatformSettingsInput,
    );
    return NextResponse.json({ settings });
  } catch (error) {
    return apiError(error);
  }
}
