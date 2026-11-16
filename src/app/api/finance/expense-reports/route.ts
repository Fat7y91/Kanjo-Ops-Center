import { NextResponse } from "next/server";

import { loadExpenseReport } from "@/lib/accounts/expense-reports";
import { apiError, authorizeAny } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateParam(value: string | null): string | undefined {
  return value && DATE.test(value) ? value : undefined;
}

export async function GET(request: Request) {
  const { session, response } = await authorizeAny([
    "view_financials",
    "view_finance",
    "manage_expenses",
    "manage_expense_categories",
  ]);
  if (!session) return response;

  try {
    const params = new URL(request.url).searchParams;
    const report = await loadExpenseReport({
      from: dateParam(params.get("from")),
      to: dateParam(params.get("to")),
      categoryId: params.get("category")?.trim() || undefined,
    });
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
