import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { editRequestSchema } from "@/lib/schemas/field-ops";
import {
  createEditRequest,
  FieldOpsError,
  getMerchantById,
} from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

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
    if (
      merchant.team !== session.user.team &&
      !session.permissions.includes("manage_merchant_state")
    ) {
      throw new FieldOpsError(
        "OUTSIDE_TEAM",
        "فقط الفريق المالك يمكنه طلب تعديل هذا التاجر.",
        403,
      );
    }

    const input = editRequestSchema.parse(await readJson(request));
    const editRequest = createEditRequest(
      id,
      input.reason,
      actorFromSession(session),
    );
    return NextResponse.json({ editRequest }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
