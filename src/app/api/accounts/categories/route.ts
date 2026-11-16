import { NextResponse } from "next/server";

import {
  createExpenseCategory,
  type ExpenseCategoryInput,
} from "@/lib/accounts/category-write";
import { apiError, authorizeAny, readJson } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(request: Request) {
  const { session, response } = await authorizeAny([
    "manage_expense_categories",
  ]);
  if (!session) return response;

  try {
    const category = await createExpenseCategory(
      (await readJson(request)) as ExpenseCategoryInput,
      session.user.id,
    );
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
