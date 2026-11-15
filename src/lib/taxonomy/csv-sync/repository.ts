import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type {
  CategoryUpsertPlan,
  VariantAttributeUpsert,
  VariantOptionUpsert,
} from "./plan";

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

export const VARIANT_ATTRIBUTE_TABLE = "variant_attributes";
export const VARIANT_OPTION_TABLE = "variant_options";

export type VariantWriteResult = {
  groupsCreated: number;
  groupsUpdated: number;
  optionsCreated: number;
  optionsUpdated: number;
};

async function existingVariantIds(
  table: string,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const client = getSupabaseServerClient();
  const found = new Set<number>();

  for (let start = 0; start < ids.length; start += CHUNK) {
    const slice = ids.slice(start, start + CHUNK);
    const { data, error } = await client
      .schema("app")
      .from(table)
      .select("id")
      .in("id", slice);

    if (error) {
      if (error.code === "42501") {
        throw new CsvSyncError(
          "MISSING_GRANT",
          "لا تملك صلاحية قراءة المتغيرات. طبّق ترحيل صلاحيات المزامنة ثم أعد المحاولة.",
          403,
        );
      }
      if (isMissingSchemaObject(error)) {
        throw new CsvSyncError(
          "MISSING_TABLE",
          "جدول المتغيرات غير موجود بعد. طبّق ترحيل قاعدة البيانات أولاً.",
          409,
        );
      }
      throw error;
    }

    for (const row of data ?? []) found.add((row as { id: number }).id);
  }

  return found;
}

/**
 * Upserts variant groups then their options.
 *
 * Groups must be written first because options carry a foreign key. A
 * standalone variant-attributes.csv reaches this function directly, so the sync
 * never waits for vendor-types.csv or categories.csv.
 */
export async function syncVariants(plan: {
  attributes: VariantAttributeUpsert[];
  options: VariantOptionUpsert[];
}): Promise<VariantWriteResult> {
  if (!hasSupabaseConfig()) {
    throw new CsvSyncError(
      "NO_DATABASE",
      "قاعدة البيانات غير مهيّأة في هذه البيئة.",
      503,
    );
  }

  const client = getSupabaseServerClient();
  const existingGroups = await existingVariantIds(
    VARIANT_ATTRIBUTE_TABLE,
    plan.attributes.map((row) => row.id),
  );
  const existingOptions = await existingVariantIds(
    VARIANT_OPTION_TABLE,
    plan.options.map((row) => row.id),
  );

  for (let start = 0; start < plan.attributes.length; start += CHUNK) {
    const slice = plan.attributes.slice(start, start + CHUNK);
    const { error } = await client
      .schema("app")
      .from(VARIANT_ATTRIBUTE_TABLE)
      .upsert(slice, { onConflict: "id", ignoreDuplicates: false });
    if (error) throw variantWriteError(error);
  }

  for (let start = 0; start < plan.options.length; start += CHUNK) {
    const slice = plan.options.slice(start, start + CHUNK);
    const { error } = await client
      .schema("app")
      .from(VARIANT_OPTION_TABLE)
      .upsert(slice, { onConflict: "id", ignoreDuplicates: false });
    if (error) throw variantWriteError(error);
  }

  let groupsCreated = 0;
  let groupsUpdated = 0;
  for (const row of plan.attributes) {
    if (existingGroups.has(row.id)) groupsUpdated += 1;
    else groupsCreated += 1;
  }

  let optionsCreated = 0;
  let optionsUpdated = 0;
  for (const row of plan.options) {
    if (existingOptions.has(row.id)) optionsUpdated += 1;
    else optionsCreated += 1;
  }

  return { groupsCreated, groupsUpdated, optionsCreated, optionsUpdated };
}

function variantWriteError(error: {
  code?: string;
  message?: string;
}): CsvSyncError | Error {
  if (error.code === "42501") {
    return new CsvSyncError(
      "MISSING_GRANT",
      "صلاحية الكتابة على المتغيرات غير ممنوحة. طبّق ترحيل صلاحيات المزامنة.",
      403,
    );
  }
  if (error.code === "23503") {
    return new CsvSyncError(
      "MISSING_PARENT",
      "تعذر ربط خيار بمجموعة متغيرات غير موجودة. أعد رفع الملف كاملاً.",
      409,
    );
  }
  if (isMissingSchemaObject(error)) {
    return new CsvSyncError(
      "MISSING_TABLE",
      "جدول المتغيرات غير موجود بعد. طبّق ترحيل قاعدة البيانات أولاً.",
      409,
    );
  }
  return error instanceof Error ? error : new Error(error.message ?? "تعذر حفظ المتغيرات.");
}
