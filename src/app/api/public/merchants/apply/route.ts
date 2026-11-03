import { NextResponse } from "next/server";

import { apiError, readJson } from "@/lib/auth/api";
import {
  corsHeaders,
  isAllowedOrigin,
  preflightResponse,
  withCors,
} from "@/lib/merchant-applications/cors";
import { submitMerchantApplication } from "@/lib/merchant-applications/repository";
import { parseMerchantApplication } from "@/lib/schemas/merchant-applications";

/**
 * Public intake for the merchant landing page.
 *
 * `https://joinus.kanjo.com.eg` is static and unauthenticated, so this route is
 * the only write path into `app.merchant_applications`. It is deliberately
 * outside the session middleware (`/api` is excluded) and defended instead by
 * three layers: a strict origin allow-list, zod validation, and the table's own
 * constraints plus the `anon` insert policy.
 *
 * The response never leaks internals: `201` carries the new id and status, a
 * rejected origin gets `403` with no CORS grant, and a database that is not
 * deployed answers `503` rather than a false success.
 */

export const dynamic = "force-dynamic";
export const runtime = "edge";

const ORIGIN_DENIED = "هذا النطاق غير مسموح بالوصول إلى هذه الخدمة.";
const INTAKE_UNAVAILABLE =
  "تعذّر استلام الطلب حالياً. حاول مرة أخرى بعد قليل.";

/** Preflight for the static landing page's `fetch` call. */
export async function OPTIONS(request: Request) {
  return preflightResponse(request.headers.get("origin"));
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  // A browser caller must come from the landing page. A request without an
  // Origin header is server-to-server (a retry from a worker, a smoke test)
  // and is not subject to CORS, so it is accepted but never granted an
  // `Access-Control-Allow-Origin`.
  if (origin && !isAllowedOrigin(origin)) {
    return NextResponse.json(
      { error: ORIGIN_DENIED },
      { status: 403, headers: corsHeaders(origin) },
    );
  }

  try {
    const input = parseMerchantApplication(await readJson(request));
    const result = await submitMerchantApplication(input);

    if (result.status === "unavailable") {
      return withCors(
        NextResponse.json({ error: INTAKE_UNAVAILABLE }, { status: 503 }),
        origin,
      );
    }

    return withCors(
      NextResponse.json(
        {
          id: result.application.id,
          status: result.application.status,
          createdAt: result.application.createdAt,
        },
        { status: 201 },
      ),
      origin,
    );
  } catch (error) {
    // Validation (422) and deployment (503) failures are already shaped by
    // `apiError`; anything else is logged there and answered neutrally.
    return withCors(apiError(error), origin);
  }
}
