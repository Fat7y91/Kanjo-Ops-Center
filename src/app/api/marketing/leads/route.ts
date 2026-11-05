import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import {
  insertMarketingLead,
  listMarketingLeads,
} from "@/lib/marketing-leads/repository";
import { publicLeadInputSchema } from "@/lib/marketing-leads/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** The inbound lead queue. */
export async function GET() {
  const { session, response } = await authorizeAny([
    "view_marketing_leads",
    "view_campaigns",
  ]);
  if (!session) return response;

  try {
    const leads = (await listMarketingLeads()) ?? [];
    return NextResponse.json(
      { leads },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Manual lead entry from the desk.
 *
 * The public spinwheel/landing intake lives at `/api/public/leads`; this route
 * lets a marketing operator add one by hand (a phone-in entry, an office
 * walk-in). It is idempotent-safe at the SQL layer only through its constraints,
 * so a duplicate phone is allowed and triaged by the desk.
 */
export async function POST(request: Request) {
  const { session, response } = await authorizeAny([
    "manage_marketing_leads",
    "record_campaign_results",
  ]);
  if (!session) return response;

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
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
