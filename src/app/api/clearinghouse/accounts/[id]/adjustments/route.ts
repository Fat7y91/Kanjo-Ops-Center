import { NextResponse } from "next/server";

import { apiError, authorizeAny } from "@/lib/auth/api";
import { partyAccountIsInternal } from "@/lib/operations/internal-courier-visibility";
import { submitManualAdjustment } from "@/lib/operations/manual-adjustment-service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorizeAny([
    "post_journal_entries",
    "settle_clearinghouse",
  ]);
  if (!session) return response;
  const canViewInternal = session.permissions.includes(
    "view_internal_staff_accounts",
  );

  const { id } = await context.params;
  const accountRef = id?.trim() ?? "";
  if (accountRef === "") {
    return NextResponse.json(
      { error: "معرّف الحساب مطلوب.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "طلب غير صالح.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  try {
    if (!canViewInternal && (await partyAccountIsInternal(accountRef))) {
      return NextResponse.json(
        {
          error: "غير مصرح بعرض حسابات المناديب الداخليين.",
          code: "FORBIDDEN_INTERNAL_ACCOUNT",
        },
        { status: 403 },
      );
    }

    const entryId = await submitManualAdjustment(
      accountRef,
      session.user.id,
      body,
    );
    return NextResponse.json({ entryId });
  } catch (error) {
    return apiError(error);
  }
}
