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
 * DIAGNOSTIC MODE: every response is HTTP 200 so Cloudflare cannot swap our
 * JSON body for its own 50x HTML page. The real outcome is in `ok` and `code`.
 * This endpoint is temporary; delete it once the founder can sign in.
 */
const DEFAULT_PHONE = "+201040491882";

// Fires when the module is evaluated, before any request handling. If this line
// is missing from the logs, the worker died during import and no try/catch in
// the handler could ever have run.
console.log("[bootstrap] module loaded");

type DiagnosticBody = Record<string, unknown>;

function reply(body: DiagnosticBody) {
  return NextResponse.json(body, { status: 200 });
}

function fail(
  code: string,
  message: string,
  detail?: string | null,
  extra?: DiagnosticBody,
) {
  return reply({ ok: false, code, error: message, detail: detail ?? null, ...extra });
}

function describe(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
    status?: number;
  };
  return [
    e.code ? `[${e.code}]` : "",
    e.message ?? "",
    e.details ? `details: ${e.details}` : "",
    e.hint ? `hint: ${e.hint}` : "",
    e.status ? `http: ${e.status}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function envReport() {
  return {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
    BOOTSTRAP_PASSWORD: Boolean(process.env.BOOTSTRAP_PASSWORD),
    BOOTSTRAP_TOKEN: Boolean(process.env.BOOTSTRAP_TOKEN),
    BOOTSTRAP_PHONE: Boolean(process.env.BOOTSTRAP_PHONE),
  };
}

export async function GET(request: Request) {
  const steps: string[] = [];

  try {
    steps.push("handler entered");
    console.log("[bootstrap] step 1: handler entered");

    const requiredToken = process.env.BOOTSTRAP_TOKEN?.trim();
    if (requiredToken) {
      steps.push("token gate");
      const provided = new URL(request.url).searchParams.get("token");
      if (provided !== requiredToken) {
        console.log("[bootstrap] token mismatch");
        return fail(
          "FORBIDDEN",
          "رمز التهيئة غير صحيح.",
          "BOOTSTRAP_TOKEN is set and the ?token= query did not match.",
          { steps, env: envReport() },
        );
      }
    }

    const password = process.env.BOOTSTRAP_PASSWORD?.trim();
    if (!password) {
      console.log("[bootstrap] missing BOOTSTRAP_PASSWORD");
      return fail(
        "MISSING_PASSWORD",
        "لم يُضبط BOOTSTRAP_PASSWORD في متغيرات البيئة.",
        "Set BOOTSTRAP_PASSWORD on the Pages project, then redeploy.",
        { steps, env: envReport() },
      );
    }

    const phone = process.env.BOOTSTRAP_PHONE?.trim() || DEFAULT_PHONE;
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      return fail("INVALID_PHONE", "رقم الهاتف ليس بصيغة E.164.", phone);
    }

    steps.push("init client");
    console.log("[bootstrap] step 2: init supabase client");
    const client = getSupabaseServerClient();

    steps.push("governor check");
    console.log("[bootstrap] step 3: hasOtherActiveGovernor");
    if (await hasOtherActiveGovernor(client, phone)) {
      console.log("[bootstrap] already bootstrapped");
      return fail(
        "ALREADY_BOOTSTRAPPED",
        "يوجد حساب مدير نشط بالفعل. أُوقفت أداة التهيئة.",
        null,
        { steps },
      );
    }

    steps.push("bootstrap founder");
    console.log("[bootstrap] step 4: bootstrapFounder");
    const account = await bootstrapFounder(client, phone, password);

    console.log("[bootstrap] done", { permissionsGranted: account.permissionsGranted });
    return reply({ ok: true, steps, account });
  } catch (error) {
    const detail = describe(error);
    console.log("[bootstrap] caught", { steps, detail });

    if (error instanceof BootstrapError) {
      return fail(error.code, error.message, error.detail, { steps });
    }

    // Anything unhandled: report the real class, message and a trimmed stack so
    // an import-time or polyfill failure is identifiable on screen.
    const e = error as { name?: string; message?: string; stack?: string };
    return reply({
      ok: false,
      code: "UNHANDLED",
      error: String(error),
      name: e?.name ?? "Error",
      message: e?.message ?? String(error),
      stack: e?.stack?.split("\n").slice(0, 8).join("\n") ?? null,
      steps,
      env: envReport(),
    });
  }
}
