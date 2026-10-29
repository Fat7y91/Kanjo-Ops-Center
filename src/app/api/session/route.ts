import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/server-session";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const session = await getServerSession();

  if (!session) {
    const response = NextResponse.json(
      { session: null },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const token = await createSessionToken(
    session.user.id,
    session.permissions,
    session.revision,
  );

  const response = NextResponse.json(
    { session },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
