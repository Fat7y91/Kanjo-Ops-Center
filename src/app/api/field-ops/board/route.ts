import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth/api";
import { buildBoard } from "@/lib/field-ops/board";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const { session, response } = await authorize("view_all_teams_visits");
  if (!session) return response;

  return NextResponse.json(
    { board: await buildBoard(session) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
