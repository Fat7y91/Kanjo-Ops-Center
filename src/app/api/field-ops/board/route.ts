import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth/api";
import { buildBoard } from "@/lib/field-ops/board";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, response } = await authorize("view_field_ops");
  if (!session) return response;

  return NextResponse.json(
    { board: buildBoard(session) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
