import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { CategoryUpsertPlan } from "./plan";

export const CATEGORY_TABLE = "taxonomy_categories";

export class CsvSyncError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CsvSyncError";
    this.code = code;
    this.status = status;
  }
}

export type CategoryWriteResult = {
  created: number;
  updated: number;
};

const CHUNK = 500;

/** Reads the uuids that already exist so the result can split created/updated. */
async function existingIds(ids: string[]): Promise<Set<string>> {
  const client = getSupabaseServerClient();
  const found = new Set<string>();

  for (let start = 0; start < ids.length; start += CHUNK) {
    const slice = ids.slice(start, start + CHUNK);
    const { data, error } = await client
      .schema("app")
      .from(CATEGORY_TABLE)
      .select("id")
      .in("id", slice);

    if (error) {
      if (error.code === "42501") {
        throw new CsvSyncError(
          "MISSING_GRANT",
          "لا تملك صلاحية قراءة التصنيفات. طبّق ترحيل صلاحيات المزامنة ثم أعد المحاولة.",
          403,
        );
      }
      if (isMissingSchemaObject(error)) {
        throw new CsvSyncError(
          "MISSING_TABLE",
          "جدول التصنيفات غير موجود بعد. طبّق ترحيل قاعدة البيانات أولاً.",
          409,
        );
      }
      throw error;
    }

    for (const row of data ?? []) found.add((row as { id: string }).id);
  }

  return found;
}

/**
 * Upserts a category plan into `app.taxonomy_categories`.
 *
 * `onConflict: id` updates the mutable columns of an existing row (names,
 * parent, level, vendor scope) and inserts when the deterministic uuid is new.
 * The id itself is never updated, so a re-run is idempotent.
 */
export async function syncCategories(
  plan: CategoryUpsertPlan[],
): Promise<CategoryWriteResult> {
  if (!hasSupabaseConfig()) {
    throw new CsvSyncError(
      "NO_DATABASE",
      "قاعدة البيانات غير مهيّأة في هذه البيئة.",
      503,
    );
  }

  const client = getSupabaseServerClient();
  const before = await existingIds(plan.map((row) => row.id));

  let created = 0;
  let updated = 0;

  for (let start = 0; start < plan.length; start += CHUNK) {
    const slice = plan.slice(start, start + CHUNK);
    const { error } = await client
      .schema("app")
      .from(CATEGORY_TABLE)
      .upsert(slice, { onConflict: "id", ignoreDuplicates: false });

    if (error) {
      if (error.code === "42501") {
        throw new CsvSyncError(
          "MISSING_GRANT",
          "صلاحية الكتابة على التصنيفات غير ممنوحة. طبّق ترحيل صلاحيات المزامنة.",
          403,
        );
      }
      if (isMissingSchemaObject(error)) {
        throw new CsvSyncError(
          "MISSING_TABLE",
          "جدول التصنيفات غير موجود بعد. طبّق ترحيل قاعدة البيانات أولاً.",
          409,
        );
      }
      throw error;
    }
  }

  for (const row of plan) {
    if (before.has(row.id)) updated += 1;
    else created += 1;
  }

  return { created, updated };
}
