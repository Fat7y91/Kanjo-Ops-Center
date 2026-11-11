import { normalizeSearchText } from "@/lib/search/normalize";
import { TaxonomyError } from "@/lib/taxonomy/errors";
import { assertVendorTypeExists, taxonomySnapshot } from "@/lib/taxonomy/catalog";
import {
  bump,
  getStore,
  isoNow,
  type TaxonomyStore,
  type TaxonomySnapshot,
} from "@/lib/taxonomy/store-state";
import { categoryKey } from "@/lib/taxonomy/types";
import type { TaxonomyKind } from "@/lib/taxonomy/types";
import type { TaxonomyDecisionActor } from "@/lib/taxonomy/decisions";

/**
 * Direct creation of a catalog entry.
 *
 * This is the path used while the central sync is the only writer; it creates
 * the record from an already-authoritative Dashboard ID. Request approval lives
 * in `decisions.ts`.
 */

export type TaxonomyDirectInput = {
  kind: TaxonomyKind;
  name_ar: string;
  name_en: string;
  dashboardId: number;
  vendorTypeId?: number | null;
  parentId?: number | null;
  options?: Array<{
    option_id: number;
    option_name_ar: string;
    option_name_en?: string;
    aliases?: string[];
  }>;
};

function dashboardIdConflict(
  store: TaxonomyStore,
  kind: TaxonomyKind,
  dashboardId: number,
  vendorTypeId: number | null,
): boolean {
  if (kind === "vendor_type") {
    return store.vendorTypes.has(dashboardId);
  }
  if (kind === "category") {
    return store.categories.has(categoryKey(vendorTypeId ?? 0, dashboardId));
  }
  return store.variants.has(dashboardId);
}

/**
 * Direct creation path for operators holding `manage_categories`. This bypasses
 * the request queue entirely and links the record to a Dashboard ID in one step.
 */
export function createTaxonomyEntry(
  input: TaxonomyDirectInput,
  _actor: TaxonomyDecisionActor,
): TaxonomySnapshot {
  const store = getStore();
  const dashboardId = input.dashboardId;
  if (!Number.isInteger(dashboardId) || dashboardId <= 0) {
    throw new TaxonomyError(
      "DASHBOARD_ID_REQUIRED",
      "أدخل معرّف لوحة المستهلك الرقمي الرسمي.",
      422,
    );
  }

  const normalized = normalizeSearchText(input.name_ar);

  if (input.kind === "category") {
    if (input.vendorTypeId == null) {
      throw new TaxonomyError(
        "VENDOR_TYPE_REQUIRED",
        "اختر نوع التاجر الذي يتبع له التصنيف.",
        422,
      );
    }
    assertVendorTypeExists(input.vendorTypeId);
    const duplicate = Array.from(store.categories.values()).some(
      (category) =>
        category.vendorTypeId === input.vendorTypeId &&
        normalizeSearchText(category.name_ar) === normalized,
    );
    if (duplicate) {
      throw new TaxonomyError(
        "CATEGORY_EXISTS",
        "هذا التصنيف موجود بالفعل داخل نطاق نوع التاجر المحدد.",
        409,
      );
    }
  } else {
    const existingNames: string[] =
      input.kind === "vendor_type"
        ? Array.from(store.vendorTypes.values()).map((entry) => entry.name_ar)
        : Array.from(store.variants.values()).map((entry) => entry.name_ar);
    const duplicate = existingNames.some(
      (nameAr) => normalizeSearchText(nameAr) === normalized,
    );
    if (duplicate) {
      throw new TaxonomyError(
        input.kind === "vendor_type"
          ? "VENDOR_TYPE_EXISTS"
          : "VARIANT_EXISTS",
        "هذا السجل موجود بالفعل في التصنيف المركزي.",
        409,
      );
    }
  }

  if (
    dashboardIdConflict(
      store,
      input.kind,
      dashboardId,
      input.vendorTypeId ?? null,
    )
  ) {
    throw new TaxonomyError(
      "DASHBOARD_ID_CONFLICT",
      "هذا المعرّف مستخدم بالفعل في التصنيف المركزي.",
      409,
    );
  }

  const now = isoNow();

  if (input.kind === "vendor_type") {
    store.vendorTypes.set(dashboardId, {
      id: dashboardId,
      name_ar: input.name_ar.trim(),
      name_en: input.name_en.trim(),
      active: true,
      source: "dashboard",
      createdAt: now,
      updatedAt: now,
    });
  } else if (input.kind === "category") {
    const vendorTypeId = input.vendorTypeId as number;
    const key = categoryKey(vendorTypeId, dashboardId);
    const siblings = Array.from(store.categories.values()).filter(
      (category) => category.vendorTypeId === vendorTypeId,
    );
    store.categories.set(key, {
      key,
      id: dashboardId,
      vendorTypeId,
      parentId: input.parentId ?? null,
      name_ar: input.name_ar.trim(),
      name_en: input.name_en.trim(),
      sortOrder: siblings.length + 1,
      active: true,
      source: "dashboard",
      createdAt: now,
      updatedAt: now,
    });
  } else {
    store.variants.set(dashboardId, {
      variant_id: dashboardId,
      name_ar: input.name_ar.trim(),
      name_en: input.name_en.trim(),
      options: (input.options ?? []).map((option) => ({
        option_id: option.option_id,
        option_name_ar: option.option_name_ar,
        option_name_en: option.option_name_en ?? "",
        aliases: option.aliases ?? [],
      })),
      active: true,
      source: "dashboard",
      createdAt: now,
      updatedAt: now,
    });
  }

  bump(store);
  return taxonomySnapshot();
}
