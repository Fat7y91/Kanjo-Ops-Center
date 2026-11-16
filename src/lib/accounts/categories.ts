import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { ExpenseCategory } from "./types";

/**
 * Analytical expense buckets.
 *
 * The list is read once per treasury load. A deployment migrated without the
 * financial tables answers empty instead of failing: the expense form then
 * blocks submission and explains why, rather than posting an unclassified
 * movement the reporting tree cannot place.
 */
export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("expense_categories")
    .select("id,name_ar,name_en,active")
    .eq("active", true)
    .order("name_ar", { ascending: true })
    .abortSignal(AbortSignal.timeout(6_000));

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }

  return ((data ?? []) as Array<{
    id: string;
    name_ar: string;
    name_en: string | null;
    active: boolean;
  }>).map((row) => ({
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en ?? "",
    active: row.active,
  }));
}
