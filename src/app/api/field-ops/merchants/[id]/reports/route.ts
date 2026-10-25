import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { visitReportSchema } from "@/lib/schemas/field-ops";
import {
  createVisitReport,
  FieldOpsError,
  getMerchantById,
} from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_field_ops");
  if (!session) return response;
  const { id } = await context.params;

  try {
    const merchant = getMerchantById(id);
    if (!merchant) {
      throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
    }
    const canManageTasks = session.permissions.includes("manage_tasks");
    if (!canManageTasks && merchant.team !== session.user.team) {
      throw new FieldOpsError(
        "OUTSIDE_TEAM",
        "هذا التاجر تابع لفريق آخر. أرسل طلب نقل أولاً.",
        403,
      );
    }

    const input = visitReportSchema.parse(await readJson(request));
    const result = createVisitReport(id, input, actorFromSession(session), {
      canManageState: session.permissions.includes("manage_merchant_state"),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
