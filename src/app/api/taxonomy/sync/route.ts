import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { VARIANT_SEED, VENDOR_TYPE_SEED } from "@/lib/taxonomy/data.generated";
import { CsvSyncError } from "@/lib/taxonomy/csv-sync/repository";
import { syncCategories, syncVariants } from "@/lib/taxonomy/csv-sync/repository";
import { buildCategoryPlan, buildVariantPlan } from "@/lib/taxonomy/csv-sync/plan";
import {
  parseCategories,
  parseVariantAttributes,
  parseVendorTypes,
} from "@/lib/taxonomy/csv-sync/parse";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Applies a V1 dashboard CSV sync.
 *
 * Each file is independent: an operator may sync only `categories.csv`, only
 * `vendor-types.csv`, or only `variant-attributes.csv`. The client parses the
 * CSVs and sends whatever normalised rows it has. The server re-derives every
 * category uuid from the same md5 formula before writing, so a tampered payload
 * cannot choose its own ids. Variants use their dashboard numeric ids directly
 * and do not depend on vendor types or categories.
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
      variantAttributes?: Record<string, unknown>[];
    };

    const vendorRows = Array.isArray(payload.vendorTypes) ? payload.vendorTypes : [];
    const categoryRows = Array.isArray(payload.categories) ? payload.categories : [];
    const variantRows = Array.isArray(payload.variantAttributes)
      ? payload.variantAttributes
      : [];

    if (vendorRows.length + categoryRows.length + variantRows.length === 0) {
      throw new CsvSyncError(
        "INVALID_INPUT",
        "لم يتم إرسال أي صف للمزامنة.",
        422,
      );
    }

    const vendors = parseVendorTypes(vendorRows);
    const vendorNames = new Map<number, string>(
      VENDOR_TYPE_SEED.map((vendor) => [vendor.id, vendor.name_ar]),
    );
    for (const vendor of vendors.rows) vendorNames.set(vendor.numericId, vendor.nameAr);

    const categories = parseCategories(categoryRows);
    const planResult = buildCategoryPlan(categories, vendorNames);

    const variants = parseVariantAttributes(variantRows);
    const variantFallback = new Map(
      VARIANT_SEED.map((group) => [
        group.variant_id,
        { nameAr: group.name_ar, nameEn: group.name_en },
      ]),
    );
    const variantPlan = buildVariantPlan(
      variants,
      variantFallback,
      new Date().toISOString(),
    );

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

    const variantWrite = await syncVariants(variantPlan);

    return NextResponse.json({
      summary: {
        vendorTypesParsed: vendors.rows.length,
        categoriesParsed: categories.rows.length,
        duplicates: planResult.duplicates,
        unresolvedParents: planResult.unresolvedParents,
        unknownVendors: [...unknownVendors],
        created: writeResult.created,
        updated: writeResult.updated,
        variantGroupsParsed: variantPlan.attributes.length,
        variantOptionsParsed: variantPlan.options.length,
        variantGroupsCreated: variantWrite.groupsCreated,
        variantGroupsUpdated: variantWrite.groupsUpdated,
        variantOptionsCreated: variantWrite.optionsCreated,
        variantOptionsUpdated: variantWrite.optionsUpdated,
        variantDuplicates: variantPlan.duplicates,
        unresolvedVariantGroups: variantPlan.unresolvedGroups,
        issues: [...vendors.issues, ...categories.issues, ...variants.issues],
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
