import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { catalogRevision } from "@/lib/catalog/store";

import { resolveAutopilotMerchant } from "@/lib/catalog/autopilot/authorize";
import { autopilotSaveRequestSchema } from "@/lib/catalog/autopilot/contract";
import { saveAutopilotItems } from "@/lib/catalog/autopilot/save";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const CAPABILITIES = ["add_catalog", "edit_catalog"] as const;

export async function POST(request: Request) {
  const { session, response } = await authorizeAny([...CAPABILITIES]);
  if (!session) return response;

  try {
    const input = autopilotSaveRequestSchema.parse(await readJson(request));
    const scoped = await resolveAutopilotMerchant(session, input.merchantId);
    if (!scoped.merchant) return scoped.response;

    const result = await saveAutopilotItems(input.merchantId, input.items, {
      id: session.user.id,
      name: session.user.name,
    });
    return NextResponse.json(
      { ...result, revision: catalogRevision() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
