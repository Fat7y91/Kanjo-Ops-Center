import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { issueCustodyReceipt } from "@/lib/riders/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(request: Request) {
  const { session, response } = await authorize("manage_couriers");
  if (!session) return response;

  try {
    const result = await issueCustodyReceipt(
      await readJson(request),
      session.user.id,
    );
    return NextResponse.json({ custody: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
