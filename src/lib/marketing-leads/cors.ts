import { NextResponse } from "next/server";

/**
 * CORS policy for the public lead intake (`POST /api/public/leads`).
 *
 * The Spinwheel and campaign landing pages are static and unauthenticated, so
 * this endpoint accepts a phone number from a stranger's browser. The
 * allow-list is a literal and never a wildcard: an unknown origin receives no
 * `Access-Control-Allow-Origin` header, which makes the browser drop the
 * response. Local development may add one extra origin through
 * `PUBLIC_LEADS_DEV_ORIGIN`, ignored in production.
 */

const PRODUCTION_ORIGIN = "https://joinus.kanjo.com.eg";

function developmentOrigin(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const value = (process.env.PUBLIC_LEADS_DEV_ORIGIN ?? "").trim();
  return value.length > 0 ? value : null;
}

export function allowedOrigins(): string[] {
  const development = developmentOrigin();
  return development ? [PRODUCTION_ORIGIN, development] : [PRODUCTION_ORIGIN];
}

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  return typeof origin === "string" && allowedOrigins().includes(origin);
}

export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set("Vary", "Origin");

  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }

  return headers;
}

export function preflightResponse(origin: string | null): NextResponse {
  const headers = corsHeaders(origin);
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json(
      { error: "هذا النطاق غير مسموح بالوصول إلى هذه الخدمة." },
      { status: 403, headers },
    );
  }
  return new NextResponse(null, { status: 204, headers });
}

export function withCors(
  response: NextResponse,
  origin: string | null,
): NextResponse {
  corsHeaders(origin).forEach((value, key) => response.headers.set(key, value));
  return response;
}
