import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { CsvSyncError } from "@/lib/taxonomy/csv-sync/repository";
import { syncCategories } from "@/lib/taxonomy/csv-sync/repository";
import { buildCategoryPlan } from "@/lib/taxonomy/csv-sync/plan";
import { parseCategories, parseVendorTypes } from "@/lib/taxonomy/csv-sync/parse";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Applies a V1 dashboard CSV sync.
 *
 * The client parses the three CSV files and sends the normalised category and
 * vendor-type rows. The server re-derives every uuid from the same md5 formula
 * before writing, so a tampered payload cannot choose its own ids. Only the
 * categories table exists in the database today; vendor types and variant
 * attributes are reported back as parsed counts so the operator sees what the
 * export contained even though it has nowhere to land yet.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("manage_categories");
  if (!session) return response;

  try {
    const payload = (await readJson(request)) as {
      categories?: Record<string, unknown>[];
      vendorTypes?: Record<string, unknown>[];
    };

    if (!Array.isArray(payload.categories)) {
      throw new CsvSyncError(
        "INVALID_INPUT",
        "لم يتم إرسال ملف التصنيفات.",
        422,
      );
    }

    const vendors = parseVendorTypes(payload.vendorTypes ?? []);
    const vendorNames = new Map(vendors.rows.map((v) => [v.numericId, v.nameAr]));
    const categories = parseCategories(payload.categories);
    const planResult = buildCategoryPlan(categories, vendorNames);
    const writeResult = await syncCategories(planResult.rows);

    return NextResponse.json({
      summary: {
        vendorTypesParsed: vendors.rows.length,
        categoriesParsed: categories.rows.length,
        duplicates: planResult.duplicates,
        unresolvedParents: planResult.unresolvedParents,
        created: writeResult.created,
        updated: writeResult.updated,
        issues: [...vendors.issues, ...categories.issues],
      },
    });
  } catch (error) {
    if (error instanceof CsvSyncError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error);
  }
}
