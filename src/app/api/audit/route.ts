import { NextResponse } from "next/server";

import { apiError, authorize } from "@/lib/auth/api";
import { listAuditLogs } from "@/lib/audit/repository";
import { auditLogQuerySchema } from "@/lib/audit/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * The audit trail feed.
 *
 * Read-only by design: `app.audit_logs` refuses every update at the database
 * level, so there is no write handler here. Writes are appended by the domain
 * routes that own the governed change, through `insertAuditLog`.
 */
export async function GET(request: Request) {
  const { session, response } = await authorize("view_audit_logs");
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const query = auditLogQuerySchema.safeParse({
    collection: params.get("collection") ?? undefined,
    targetId: params.get("targetId") ?? undefined,
    actorId: params.get("actorId") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });

  if (!query.success) {
    const first = query.error.errors[0];
    return NextResponse.json(
      { error: first?.message ?? "مرشّحات غير صالحة.", code: "VALIDATION" },
      { status: 422 },
    );
  }

  try {
    const logs = (await listAuditLogs(query.data)) ?? [];
    return NextResponse.json(
      { logs },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
