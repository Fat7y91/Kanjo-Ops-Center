import { NextResponse } from "next/server";

import { apiError, authorize, authorizeAny, readJson } from "@/lib/auth/api";
import { loadClearinghouse, settleClearingRow } from "@/lib/operations/service";
import type { ClearingStatus } from "@/lib/operations/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const STATUSES: readonly ClearingStatus[] = ["pending", "cleared"];

/** Clearinghouse book. `?status=cleared` reads the settled history. */
export async function GET(request: Request) {
  const { session, response } = await authorizeAny([
    "view_clearinghouse",
    "settle_clearinghouse",
  ]);
  if (!session) return response;

  const raw = new URL(request.url).searchParams.get("status");
  const status: ClearingStatus = STATUSES.includes(raw as ClearingStatus)
    ? (raw as ClearingStatus)
    : "pending";

  try {
    const board = await loadClearinghouse(status);
    return NextResponse.json(board, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Settles one clearinghouse row.
 *
 * Gated by `settle_clearinghouse`, deliberately distinct from
 * `view_clearinghouse`: a reviewer may read the book without being able to
 * release money. The trigger rejects any attempt to change a row after it has
 * been settled.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("settle_clearinghouse");
  if (!session) return response;

  const body = (await readJson(request)) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (id === "") {
    return NextResponse.json({ error: "معرّف البند مطلوب." }, { status: 422 });
  }

  try {
    const row = await settleClearingRow(id, session.user.id, body);
    return NextResponse.json({ row });
  } catch (error) {
    return apiError(error);
  }
}
