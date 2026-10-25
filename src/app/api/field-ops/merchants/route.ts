import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { merchantCreateSchema } from "@/lib/schemas/field-ops";
import { createMerchant } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { session, response } = await authorize("create_merchants");
  if (!session) return response;

  try {
    const input = merchantCreateSchema.parse(await readJson(request));
    const merchant = createMerchant(input, actorFromSession(session));
    return NextResponse.json({ merchant }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
