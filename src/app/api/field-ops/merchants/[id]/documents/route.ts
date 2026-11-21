import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { merchantDocumentSchema } from "@/lib/schemas/field-ops";
import { addMerchantDocument } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_merchant_profile");
  if (!session) return response;
  const { id } = await context.params;

  try {
    const input = merchantDocumentSchema.parse(await readJson(request));
    const merchant = await addMerchantDocument(
      id,
      input,
      actorFromSession(session),
    );
    return NextResponse.json({ merchant }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
