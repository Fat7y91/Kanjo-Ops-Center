import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";

import { resolveAutopilotMerchant } from "@/lib/catalog/autopilot/authorize";
import {
  autopilotEnrichRequestSchema,
} from "@/lib/catalog/autopilot/contract";
import { enrichAutopilotItems } from "@/lib/catalog/autopilot/enrich";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const CAPABILITIES = ["add_catalog", "edit_catalog"] as const;

export async function POST(request: Request) {
  const { session, response } = await authorizeAny([...CAPABILITIES]);
  if (!session) return response;

  try {
    const input = autopilotEnrichRequestSchema.parse(await readJson(request));
    const scoped = await resolveAutopilotMerchant(session, input.merchantId);
    if (!scoped.merchant) return scoped.response;

    const result = await enrichAutopilotItems(input.items, {
      merchantId: input.merchantId,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
