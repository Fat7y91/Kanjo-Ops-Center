import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/server-session";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Per-user, cookie-authenticated JSON that also rotates the session cookie.
 * It must never be stored by a browser or shared cache, and `Vary: Cookie`
 * keeps any intermediary from serving one user's capabilities to another.
 */
const SESSION_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Cookie",
};

export async function GET() {
  const session = await getServerSession();

  if (!session) {
    const response = NextResponse.json(
      { session: null },
      { headers: SESSION_RESPONSE_HEADERS },
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
    { headers: SESSION_RESPONSE_HEADERS },
  );
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
