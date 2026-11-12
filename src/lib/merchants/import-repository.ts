import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isUniqueViolation } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { MerchantImportCandidate } from "./import";

/**
 * Tier 4 write path for the merchants CSV import.
 *
 * The directory's manual create goes through the field-ops store because it
 * builds a full merchant record. A spreadsheet only carries the five essential
 * columns, so this path inserts those directly and leaves every other column at
 * its schema default. Each row is attempted on its own so a duplicate name is
 * reported and skipped instead of failing the whole file.
 */

export type MerchantImportResult = {
  imported: number;
  skipped: { line: number; message: string }[];
};

export function isMerchantImportConfigured(): boolean {
  return hasSupabaseConfig();
}

export async function insertMerchantImports(
  candidates: readonly MerchantImportCandidate[],
  createdBy: string | null,
): Promise<MerchantImportResult> {
  const client = getSupabaseServerClient();
  const skipped: { line: number; message: string }[] = [];
  let imported = 0;

  for (const candidate of candidates) {
    const now = new Date().toISOString();
    const { error } = await client.schema("app").from("merchants").insert({
      id: `m-${crypto.randomUUID().slice(0, 8)}`,
      name: candidate.name,
      normalized_name: candidate.normalizedName,
      vendor_type_id: candidate.vendorTypeId,
      vendor_type: candidate.vendorType,
      city_id: candidate.cityId,
      target_commission: candidate.commissionRate,
      phone: candidate.phone,
      address: candidate.address,
      team: null,
      first_entry_by: createdBy,
      first_entry_at: createdBy ? now : null,
      created_at: now,
      updated_at: now,
    });

    if (!error) {
      imported += 1;
      continue;
    }
    if (isUniqueViolation(error)) {
      skipped.push({
        line: candidate.line,
        message: `يوجد تاجر بهذا الاسم بالفعل: ${candidate.name}.`,
      });
      continue;
    }
    skipped.push({
      line: candidate.line,
      message: `تعذر حفظ التاجر ${candidate.name}.`,
    });
  }

  return { imported, skipped };
}
