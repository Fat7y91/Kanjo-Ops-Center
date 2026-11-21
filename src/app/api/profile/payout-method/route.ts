import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { apiError, readJson } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import { ProfileError } from "@/lib/profile/errors";
import { savePayoutMethod } from "@/lib/profile/profile";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * The caller's payout destination.
 *
 * One row per operator, keyed by the session subject. A saved edit drops the
 * row back to `pending` inside the database trigger, so the response status is
 * whatever the trigger produced rather than something this route decides.
 */
export async function PUT(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  try {
    const payoutMethod = await savePayoutMethod(
      session.user.id,
      await readJson(request),
    );
    return NextResponse.json({ payoutMethod });
  } catch (error) {
    if (error instanceof ProfileError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof ZodError) {
      const first = error.errors[0];
      return NextResponse.json(
        {
          error: first ? first.message : "فشل التحقق من البيانات.",
          code: "VALIDATION",
          path: first?.path,
        },
        { status: 422 },
      );
    }
    return apiError(error);
  }
}
