import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth/api";
import { taxonomySnapshot } from "@/lib/taxonomy/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const { session, response } = await authorize("view_taxonomy");
  if (!session) return response;

  return NextResponse.json(taxonomySnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
