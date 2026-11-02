import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { loadOperationsBoard, logOperation } from "@/lib/operations/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Operations logger.
 *
 * `GET` returns the roster, the merchants and recent orders so the form can
 * render without a second round trip. `POST` appends one order; the SQL
 * triggers resolve the commission, freeze it, and route both clearinghouse
 * rows inside the same transaction.
 */
export async function GET() {
  const { session, response } = await authorize("log_operations");
  if (!session) return response;

  try {
    const board = await loadOperationsBoard();
    return NextResponse.json(board, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const { session, response } = await authorize("log_operations");
  if (!session) return response;

  try {
    const operation = await logOperation(session.user.id, await readJson(request));
    return NextResponse.json({ operation }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
