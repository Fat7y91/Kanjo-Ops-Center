import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { VENDOR_TYPE_SEED } from "@/lib/taxonomy/data.generated";
import { CsvSyncError } from "@/lib/taxonomy/csv-sync/repository";
import { syncCategories } from "@/lib/taxonomy/csv-sync/repository";
import { buildCategoryPlan } from "@/lib/taxonomy/csv-sync/plan";
import { parseCategories, parseVendorTypes } from "@/lib/taxonomy/csv-sync/parse";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Applies a V1 dashboard CSV sync.
 *
 * Each file is independent: an operator may sync only `categories.csv`. The
 * client parses the CSVs and sends whatever normalised rows it has. The server
 * re-derives every uuid from the same md5 formula before writing, so a tampered
 * payload cannot choose its own ids.
 *
 * When `vendor-types.csv` is not supplied, vendor names fall back to the
 * generated VENDOR_TYPE_SEED so `vendor_type` is still the Arabic name the seed
 * wrote, never a bare numeric id. A new vendor type unknown to both the upload
 * and the seed keeps its numeric string and is reported so the operator knows
 * to upload vendor types too.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("manage_categories");
  if (!session) return response;

  try {
    const payload = (await readJson(request)) as {
      categories?: Record<string, unknown>[];
      vendorTypes?: Record<string, unknown>[];
    };

    const hasVendorTypes = Array.isArray(payload.vendorTypes);
    const hasCategories = Array.isArray(payload.categories);

    if (!hasVendorTypes && !hasCategories) {
      throw new CsvSyncError(
        "INVALID_INPUT",
        "لم يتم إرسال أي ملف للمزامنة.",
        422,
      );
    }

    const vendors = parseVendorTypes(payload.vendorTypes ?? []);
    const vendorNames = new Map<number, string>(
      VENDOR_TYPE_SEED.map((vendor) => [vendor.id, vendor.name_ar]),
    );
    for (const vendor of vendors.rows) vendorNames.set(vendor.numericId, vendor.nameAr);

    const categories = parseCategories(payload.categories ?? []);
    const planResult = buildCategoryPlan(categories, vendorNames);

    // A vendor type that is in neither the upload nor the seed was written with
    // its numeric id as `vendor_type`; flag it so the operator can upload the
    // missing vendor-types.csv rather than silently storing a bare number.
    const unknownVendors = new Set<number>();
    for (const category of categories.rows) {
      if (!vendorNames.has(category.vendorTypeId)) {
        unknownVendors.add(category.vendorTypeId);
      }
    }

    const writeResult =
      planResult.rows.length > 0
        ? await syncCategories(planResult.rows)
        : { created: 0, updated: 0 };

    return NextResponse.json({
      summary: {
        vendorTypesParsed: vendors.rows.length,
        categoriesParsed: categories.rows.length,
        duplicates: planResult.duplicates,
        unresolvedParents: planResult.unresolvedParents,
        unknownVendors: [...unknownVendors],
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
