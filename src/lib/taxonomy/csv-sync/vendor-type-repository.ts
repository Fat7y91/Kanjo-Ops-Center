import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { CsvSyncError } from "./repository";
import type { VendorTypeRecord } from "./vendor-types";

/** Persistence for the V1 `vendor-types.csv` snapshot. */

export const VENDOR_TYPE_TABLE = "vendor_types";

type VendorTypeDbRow = {
  id: number;
  key: string;
  name_ar: string;
  name_en: string | null;
};

function toRecord(row: VendorTypeDbRow): VendorTypeRecord {
  return {
    id: Number(row.id),
    key: row.key ?? "",
    nameAr: row.name_ar,
    nameEn: row.name_en ?? "",
  };
}

export async function listVendorTypes(): Promise<VendorTypeRecord[]> {
  if (!hasSupabaseConfig()) return [];
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from(VENDOR_TYPE_TABLE)
    .select("id,key,name_ar,name_en")
    .order("id", { ascending: true });

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    if (error.code === "42501") {
      throw new CsvSyncError(
        "MISSING_GRANT",
        "لا تملك صلاحية قراءة أنواع التجّار. طبّق ترحيل صلاحيات المزامنة.",
        403,
      );
    }
    throw error;
  }
  return ((data ?? []) as unknown as VendorTypeDbRow[]).map(toRecord);
}

export async function upsertVendorTypes(
  rows: readonly VendorTypeRecord[],
): Promise<void> {
  if (rows.length === 0) return;
  if (!hasSupabaseConfig()) {
    throw new CsvSyncError(
      "NO_DATABASE",
      "قاعدة البيانات غير مهيّأة في هذه البيئة.",
      503,
    );
  }

  const payload = rows.map((row) => ({
    id: row.id,
    key: row.key,
    name_ar: row.nameAr,
    name_en: row.nameEn,
    updated_at: new Date().toISOString(),
  }));

  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from(VENDOR_TYPE_TABLE)
    .upsert(payload, { onConflict: "id", ignoreDuplicates: false });

  if (error) {
    if (error.code === "42501") {
      throw new CsvSyncError(
        "MISSING_GRANT",
        "صلاحية الكتابة على أنواع التجّار غير ممنوحة. طبّق ترحيل صلاحيات المزامنة.",
        403,
      );
    }
    if (isMissingSchemaObject(error)) {
      throw new CsvSyncError(
        "MISSING_TABLE",
        "جدول أنواع التجّار غير موجود بعد. طبّق ترحيل قاعدة البيانات أولاً.",
        409,
      );
    }
    throw error;
  }
}
