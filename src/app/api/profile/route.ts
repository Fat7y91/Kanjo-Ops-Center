import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { apiError, readJson } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import { ProfileError } from "@/lib/profile/errors";
import { loadProfileSnapshot, saveProfile } from "@/lib/profile/profile";

export const dynamic = "force-dynamic";
export const runtime = "edge";

function profileErrorResponse(error: unknown): NextResponse {
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

/**
 * The caller's own profile.
 *
 * There is no `id` parameter anywhere: the operator is always the session
 * subject, so this route cannot be pointed at another account.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  try {
    const snapshot = await loadProfileSnapshot(session.user.id);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return profileErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  try {
    const profile = await saveProfile(session.user.id, await readJson(request));
    return NextResponse.json({ profile });
  } catch (error) {
    return profileErrorResponse(error);
  }
}
