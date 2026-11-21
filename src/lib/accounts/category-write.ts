import "server-only";

import { actorIdOrNull } from "@/lib/db/actor-id";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { AccountsError } from "./errors";
import type { ExpenseCategory } from "./types";

/**
 * Creates an analytical expense bucket.
 *
 * Names are compared case-insensitively by a unique index, so a duplicate is a
 * user-facing validation error rather than a raw constraint failure. Only the
 * current operator can be recorded as the creator; the id comes from the
 * session, never the request body.
 */

export type ExpenseCategoryInput = {
  nameAr: string;
  nameEn?: string;
};

export async function createExpenseCategory(
  input: ExpenseCategoryInput,
  createdBy: string | null,
): Promise<ExpenseCategory> {
  const nameAr = input.nameAr?.trim() ?? "";
  const nameEn = input.nameEn?.trim() ?? "";
  if (nameAr.length < 2) {
    throw new AccountsError(
      "INVALID_CATEGORY",
      "اسم البند يجب أن يكون حرفين على الأقل.",
    );
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("expense_categories")
    .insert({
      name_ar: nameAr,
      name_en: nameEn || null,
      created_by: actorIdOrNull(createdBy),
    })
    .select("id,name_ar,name_en,active")
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new AccountsError(
        "STORE_UNAVAILABLE",
        "بنود المصروفات غير متاحة على هذا النشر بعد.",
        503,
      );
    }
    if (error.code === "23505") {
      throw new AccountsError(
        "DUPLICATE_CATEGORY",
        "يوجد بند مصروفات بهذا الاسم بالفعل.",
      );
    }
    throw error;
  }

  const row = data as {
    id: string;
    name_ar: string;
    name_en: string | null;
    active: boolean;
  };
  return {
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en ?? "",
    active: row.active,
  };
}
