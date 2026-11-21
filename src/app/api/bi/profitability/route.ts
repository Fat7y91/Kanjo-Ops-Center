import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import { loadProfitability } from "@/lib/bi/profitability-server";
import type { Permission } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cityId: z.string().min(1).max(64).optional(),
});

/**
 * Order P&L waterfall for the overview and the settlement dashboard.
 *
 * The overview gate is `view_overview_finance` at clearance 3; the settlement
 * screen carries its own grants. A caller who holds either surface may read
 * the same ledger-grounded slice.
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "يلزم تسجيل الدخول." },
      { status: 401 },
    );
  }

  const canOverviewFinance =
    session.permissions.includes("view_overview_finance") &&
    session.clearanceLevel >= 3;
  const settlePermissions: Permission[] = [
    "view_clearinghouse",
    "settle_clearinghouse",
    "settle_clearinghouse_partial",
  ];
  const canSettle = settlePermissions.some((permission) =>
    session.permissions.includes(permission),
  );

  if (!canOverviewFinance && !canSettle) {
    return NextResponse.json(
      { error: "لا تملك هذه الصلاحية." },
      { status: 403 },
    );
  }

  try {
    const params = new URL(request.url).searchParams;
    const query = querySchema.parse({
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      cityId: params.get("cityId") || undefined,
    });

    const summary = await loadProfitability({
      from: query.from ?? null,
      to: query.to ?? null,
      cityId: query.cityId ?? null,
    });

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
