import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import { loadProfitability } from "@/lib/bi/profitability-server";
import type { Permission } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const dateTime = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

const querySchema = z.object({
  from: z.string().regex(dateTime).optional(),
  to: z.string().regex(dateTime).optional(),
  cityId: z.string().min(1).max(64).optional(),
  excludeInternalStaff: z.enum(["1", "0"]).optional(),
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
      excludeInternalStaff: params.get("excludeInternalStaff") || undefined,
    });

    const canViewInternalStaff = session.permissions.includes(
      "view_internal_staff_accounts",
    );
    const summary = await loadProfitability({
      from: query.from ?? null,
      to: query.to ?? null,
      cityId: query.cityId ?? null,
      // Internal courier payables are founder-only: a caller without the grant
      // is pinned to the excluded slice even when it asks to include them.
      excludeInternalStaff:
        !canViewInternalStaff || query.excludeInternalStaff === "1",
    });

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
