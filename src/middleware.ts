import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  sessionHasAny,
  verifySessionToken,
} from "@/lib/auth/session";
import { isPublicPath, moduleForPath, permissionsForPath } from "@/lib/rbac/modules";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (!payload) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const accepted = permissionsForPath(pathname);
  const bypass = moduleForPath(pathname)?.clearanceBypass;

  if (accepted.length > 0 && !sessionHasAny(payload, accepted)) {
    // A module that also admits by rank (the inbox) is left to the page guard:
    // `requireModuleAccess` reads the authoritative clearance from the database,
    // whereas the token carries the rank only from the login that minted it, so
    // an older cookie would otherwise be bounced here despite qualifying.
    if (bypass !== undefined) return NextResponse.next();

    const forbiddenUrl = request.nextUrl.clone();
    forbiddenUrl.pathname = "/forbidden";
    forbiddenUrl.search = "";
    forbiddenUrl.searchParams.set("permission", accepted[0]);
    forbiddenUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(forbiddenUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
