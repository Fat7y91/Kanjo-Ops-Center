import { NextResponse } from "next/server";

import { apiError, authorize } from "@/lib/auth/api";
import { loadOrderBreakdown } from "@/lib/operations/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Unit-economics breakdown for one logged order.
 *
 * Gated by `view_clearinghouse`: this is the management view of a party's money,
 * the same audience that reads the book. The logging surface stays blind and
 * never calls this route.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_clearinghouse");
  if (!session) return response;

  const { id } = await context.params;
  const operationId = id?.trim() ?? "";
  if (operationId === "") {
    return NextResponse.json(
      { error: "معرّف العملية مطلوب.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  try {
    const breakdown = await loadOrderBreakdown(operationId);
    return NextResponse.json(breakdown, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
