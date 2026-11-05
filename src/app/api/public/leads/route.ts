import { NextResponse } from "next/server";

import { apiError, readJson } from "@/lib/auth/api";
import {
  corsHeaders,
  isAllowedOrigin,
  preflightResponse,
  withCors,
} from "@/lib/marketing-leads/cors";
import { insertMarketingLead } from "@/lib/marketing-leads/repository";
import { publicLeadInputSchema } from "@/lib/marketing-leads/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Public lead capture for the Spinwheel and campaign landing pages.
 *
 * Unlike the authenticated desk route, this endpoint is outside the session
 * middleware (all `/api` is) and is meant for anonymous contestants. It is
 * defended by a strict origin allow-list, zod validation and the table's own
 * constraints. A database that is not deployed answers `503`, never a false
 * success — a lost contestant entry cannot be recovered.
 */

const ORIGIN_DENIED = "هذا النطاق غير مسموح بالوصول إلى هذه الخدمة.";
const INTAKE_UNAVAILABLE =
  "تعذّر استلام المشاركة حالياً. حاول مرة أخرى بعد قليل.";

export async function OPTIONS(request: Request) {
  return preflightResponse(request.headers.get("origin"));
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (origin && !isAllowedOrigin(origin)) {
    return NextResponse.json(
      { error: ORIGIN_DENIED },
      { status: 403, headers: corsHeaders(origin) },
    );
  }

  try {
    const input = publicLeadInputSchema.parse(await readJson(request));
    const lead = await insertMarketingLead({
      campaignId: input.campaignId,
      cityId: input.cityId,
      phoneNumber: input.phoneNumber,
      promoCode: input.promoCode,
      userGuess: input.userGuess,
      prizeDetails: input.prizeDetails,
      source: input.source,
    });

    return withCors(
      NextResponse.json({ id: lead.id, createdAt: lead.createdAt }, { status: 201 }),
      origin,
    );
  } catch (error) {
    return withCors(apiError(error), origin);
  }
}
