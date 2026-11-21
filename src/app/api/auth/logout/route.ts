import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "edge";

function originOf(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Logout as a Route Handler for the same reason as login: an Edge Server
 * Action that redirects crashes on `next-on-pages`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const response = NextResponse.redirect(
    new URL("/login", originOf(request)),
    303,
  );
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
