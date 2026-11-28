import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { apiError, readJson } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import { ProfileError } from "@/lib/profile/errors";
import { changePassword } from "@/lib/profile/profile";
import { readProfile } from "@/lib/profile/repository";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Rotates the caller's password.
 *
 * The current password is re-verified against Supabase Auth before the new one
 * is set, so a stolen session cookie alone cannot lock the owner out. The phone
 * comes from the stored profile, never from the request body.
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  try {
    const row = await readProfile(session.user.id);
    if (!row) {
      throw new ProfileError(
        "PROFILE_MISSING",
        "تعذر تحميل الملف الشخصي.",
        404,
      );
    }

    await changePassword(session.user.id, row.phone, await readJson(request));
    return NextResponse.json({ ok: true });
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
