import { NextResponse } from "next/server";

import { resolveLoginRequest } from "@/lib/auth/login";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Absolute origin for redirects. Cloudflare terminates TLS upstream, so the
 * request URL can carry an internal host; prefer the forwarded headers.
 */
function originOf(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, originOf(request)), 303);
}

/**
 * Standard Route Handler login. This deliberately replaces the Server Action:
 * on `next-on-pages` an action that calls `redirect()` throws
 * `Invariant: Missing initURL` and surfaces as a 500.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo(request, "/login?error=invalid-request");
  }

  const outcome = await resolveLoginRequest(formData);

  if (!outcome.ok) {
    return redirectTo(request, outcome.redirectTo);
  }

  const response = redirectTo(request, outcome.redirectTo);
  response.cookies.set(SESSION_COOKIE, outcome.token, sessionCookieOptions);
  return response;
}
