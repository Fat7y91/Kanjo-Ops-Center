import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { apiError, readJson } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import {
  loadCapitalBoard,
  submitCapitalDeposit,
} from "@/lib/profile/capital-service";
import { ProfileError } from "@/lib/profile/errors";
import { isProfileDatabaseConfigured } from "@/lib/profile/repository";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Treasury authority, mirroring `app.can_manage_treasury()` and
 * `resolveTreasuryAccess().full`: the full-book capabilities, not the
 * deposit-only one.
 */
const TREASURY_PERMISSIONS = ["view_bank_balances", "add_bank_account"] as const;

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ProfileError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    const first = error.errors[0];
    return NextResponse.json(
      {
        error: first ? first.message : "فشل التحقق من البيانات.",
        code: "VALIDATION",
        path: first?.path,
      },
      { status: 422 },
    );
  }
  return apiError(error);
}

/**
 * Capital deposits.
 *
 * `?scope=all` lists the review queue for a viewer holding `manage_accounts`;
 * without it the caller sees only their own filings. A founder therefore never
 * receives another founder's rows even if they craft the query string.
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const canDecide = TREASURY_PERMISSIONS.some((permission) =>
    session.permissions.includes(permission),
  );
  const wantsAll = new URL(request.url).searchParams.get("scope") === "all";
  if (wantsAll && !canDecide) {
    return NextResponse.json(
      { error: "لا تملك صلاحية مراجعة الإيداعات." },
      { status: 403 },
    );
  }

  try {
    const board = await loadCapitalBoard({
      founderId: wantsAll ? null : session.user.id,
      canDecide,
    });
    return NextResponse.json(board, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Accepts only a path this operator's own upload produced.
 *
 * `receiptPath` is stored verbatim, and the read path mints a signed URL for
 * whatever it names. Without the prefix check a founder could file a deposit
 * pointing at another operator's receipt folder.
 */
function readReceiptPath(value: unknown, ownerId: string): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (path === "") return null;
  if (!path.startsWith(`${ownerId}/`) || path.includes("..")) {
    throw new ProfileError(
      "INVALID_RECEIPT",
      "مرجع الإيصال غير صالح.",
      422,
    );
  }
  return path;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }
  if (!isProfileDatabaseConfigured()) {
    return NextResponse.json(
      { error: "قاعدة البيانات غير متصلة.", code: "STORE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    const receiptPath = readReceiptPath(body.receiptPath, session.user.id);

    const deposit = await submitCapitalDeposit(
      session.user.id,
      body,
      receiptPath,
    );
    return NextResponse.json({ deposit }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
