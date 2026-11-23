import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { VARIANT_SEED, VENDOR_TYPE_SEED } from "@/lib/taxonomy/data.generated";
import { buildCategoryPlan, buildVariantPlan } from "@/lib/taxonomy/csv-sync/plan";
import {
  parseCategories,
  parseVariantAttributes,
  parseVendorTypes,
} from "@/lib/taxonomy/csv-sync/parse";
import {
  CsvSyncError,
  syncCategories,
  syncVariants,
  type CategoryWriteResult,
  type VariantWriteResult,
} from "@/lib/taxonomy/csv-sync/repository";
import { buildTaxonomySyncSummary } from "@/lib/taxonomy/csv-sync/summary";
import {
  buildVendorCatalog,
  planVendorTypes,
  resolveCategoryVendors,
  type VendorTypeRecord,
} from "@/lib/taxonomy/csv-sync/vendor-types";
import {
  listVendorTypes,
  upsertVendorTypes,
} from "@/lib/taxonomy/csv-sync/vendor-type-repository";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const EMPTY_CATEGORY_WRITE: CategoryWriteResult = {
  created: 0,
  updated: 0,
  createdRows: [],
};

const EMPTY_VARIANT_WRITE: VariantWriteResult = {
  groupsCreated: 0,
  groupsUpdated: 0,
  optionsCreated: 0,
  optionsUpdated: 0,
  createdGroups: [],
  createdOptions: [],
};

/** Generated V2 seed kept as a read-only fallback for legacy category scopes. */
const SEED_VENDORS: VendorTypeRecord[] = VENDOR_TYPE_SEED.map((vendor) => ({
  id: vendor.id,
  key: "",
  nameAr: vendor.name_ar,
  nameEn: vendor.name_en,
}));

/**
 * Applies a V1 dashboard CSV sync.
 *
 * Each file is independent: an operator may sync categories alone, vendor types
 * alone, or variant attributes alone. The client parses the CSVs and sends the
 * normalised rows; the server re-derives every category uuid and resolves each
 * `vendor_type` reference against the uploaded file, the persisted vendor types
 * and the read-only V2 seed. A category whose vendor type cannot be resolved is
 * skipped with an actionable reason instead of being written under a number.
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
      throw new CsvSyncError("INVALID_INPUT", "لم يتم إرسال أي صف للمزامنة.", 422);
    }

    const vendors = parseVendorTypes(vendorRows);
    const existingVendors = await listVendorTypes();
    const vendorPlan = planVendorTypes(vendors.rows, existingVendors);
    await upsertVendorTypes(vendorPlan.rows);

    const catalog = buildVendorCatalog(
      [...SEED_VENDORS, ...existingVendors],
      vendorPlan.rows,
    );
    const categories = parseCategories(categoryRows);
    const resolution = resolveCategoryVendors(categories, catalog);
    const categoryPlan = buildCategoryPlan(
      resolution.parsed,
      resolution.vendorNames,
    );
    const categoryWrite =
      categoryPlan.rows.length > 0
        ? await syncCategories(categoryPlan.rows)
        : EMPTY_CATEGORY_WRITE;

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
    const variantWrite =
      variantPlan.attributes.length > 0 || variantPlan.options.length > 0
        ? await syncVariants(variantPlan)
        : EMPTY_VARIANT_WRITE;

    const summary = buildTaxonomySyncSummary({
      vendorPlan,
      categoryPlan,
      categoryWrite,
      variantPlan,
      variantWrite,
      issues: [
        ...vendors.issues,
        ...resolution.parsed.issues,
        ...variants.issues,
      ],
    });

    return NextResponse.json({ summary });
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
