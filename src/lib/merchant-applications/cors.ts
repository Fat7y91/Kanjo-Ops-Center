import { NextResponse } from "next/server";

/**
 * CORS policy for the public intake endpoint.
 *
 * `POST /api/public/merchants/apply` is called by a static landing page on a
 * different origin. The allow-list is a literal, not a wildcard and not a
 * pattern: a customer application carries a phone number, so any origin that
 * can read the response would be able to probe the intake endpoint from a
 * stranger's browser. Unknown origins get no `Access-Control-Allow-Origin`
 * header at all, which is what makes the browser drop the response.
 *
 * Local development is the one exception: when a developer sets
 * `PUBLIC_APPLICATIONS_DEV_ORIGIN`, that single extra origin is honoured — but
 * only outside production. Nothing can widen the production allow-list except
 * editing this file.
 */

/** The landing page. Changing its host is a deploy-time decision, not a secret. */
const PRODUCTION_ORIGIN = "https://joinus.kanjo.com.eg";

/** Extra origin for local integration runs, ignored in production builds. */
function developmentOrigin(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const value = (process.env.PUBLIC_APPLICATIONS_DEV_ORIGIN ?? "").trim();
  return value.length > 0 ? value : null;
}

/** Every origin currently allowed to call the endpoint. */
export function allowedOrigins(): string[] {
  const development = developmentOrigin();
  return development ? [PRODUCTION_ORIGIN, development] : [PRODUCTION_ORIGIN];
}

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  return typeof origin === "string" && allowedOrigins().includes(origin);
}

/**
 * CORS response headers for one request.
 *
 * `Vary: Origin` is set even on a rejection so no cache can serve the allowed
 * variant of a response to a different caller.
 */
export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set("Vary", "Origin");

  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    // Preflight result can be cached for a day: the policy is static.
    headers.set("Access-Control-Max-Age", "86400");
  }

  return headers;
}

/** Preflight answer: `204` for an allowed origin, `403` for anything else. */
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

/** Adds the policy headers to a response produced by the handler. */
export function withCors(
  response: NextResponse,
  origin: string | null,
): NextResponse {
  corsHeaders(origin).forEach((value, key) => response.headers.set(key, value));
  return response;
}
