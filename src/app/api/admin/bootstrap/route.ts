import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import {
  bootstrapFounder,
  BootstrapError,
  hasOtherActiveGovernor,
} from "@/lib/rbac/services/bootstrap-service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * One-shot Founder bootstrap, hit once from a browser after the RBAC migrations
 * are applied. It mints the auth account through the Admin API (a direct
 * auth.users INSERT skips GoTrue's bcrypt hashing and leaves an account that
 * cannot sign in), then grants the full capability set.
 *
 * Safety rails:
 * - The password comes from BOOTSTRAP_PASSWORD and is never committed. A
 *   plaintext founder password in public git history is unrecoverable.
 * - When BOOTSTRAP_TOKEN is set, `?token=` must match it.
 * - It refuses to run while another active governor exists, so it cannot mint a
 *   second all-powerful account, but it can still repair the founder's own
 *   half-provisioned record.
 *
 * Diagnostics are intentionally verbose: this endpoint is temporary and exists
 * precisely to make setup failures readable instead of an opaque 502. Delete
 * the route once the founder can sign in.
 */
const DEFAULT_PHONE = "+201040491882";

function fail(
  code: string,
  message: string,
  status: number,
  detail?: string | null,
) {
  return NextResponse.json(
    { error: message, code, detail: detail ?? null },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    const requiredToken = process.env.BOOTSTRAP_TOKEN?.trim();
    if (requiredToken) {
      const provided = new URL(request.url).searchParams.get("token");
      if (provided !== requiredToken) {
        return fail("FORBIDDEN", "رمز التهيئة غير صحيح.", 403);
      }
    }

    const password = process.env.BOOTSTRAP_PASSWORD?.trim();
    if (!password) {
      return fail(
        "MISSING_PASSWORD",
        "لم يُضبط BOOTSTRAP_PASSWORD في متغيرات البيئة.",
        503,
      );
    }

    const phone = process.env.BOOTSTRAP_PHONE?.trim() || DEFAULT_PHONE;
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      return fail("INVALID_PHONE", "رقم الهاتف ليس بصيغة E.164.", 422);
    }

    const client = getSupabaseServerClient();

    if (await hasOtherActiveGovernor(client, phone)) {
      return fail(
        "ALREADY_BOOTSTRAPPED",
        "يوجد حساب مدير نشط بالفعل. أُوقفت أداة التهيئة.",
        409,
      );
    }

    const account = await bootstrapFounder(client, phone, password);
    return NextResponse.json({ ok: true, account }, { status: 200 });
  } catch (error) {
    if (error instanceof BootstrapError) {
      return fail(error.code, error.message, error.status, error.detail);
    }

    // Unhandled failures (missing env, import-time errors, bad config) would
    // otherwise surface as a blind Cloudflare 502. Return the real cause.
    const e = error as { name?: string; message?: string; stack?: string };
    return NextResponse.json(
      {
        error: String(error),
        name: e?.name ?? "Error",
        message: e?.message ?? String(error),
        stack: e?.stack?.split("\n").slice(0, 6).join("\n") ?? null,
      },
      { status: 500 },
    );
  }
}
