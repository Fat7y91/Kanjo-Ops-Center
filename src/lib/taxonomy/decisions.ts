import { TaxonomyError } from "@/lib/taxonomy/errors";
import { assertVendorTypeExists, taxonomySnapshot } from "@/lib/taxonomy/catalog";
import {
  bump,
  clone,
  getStore,
  isoNow,
  type TaxonomySnapshot,
} from "@/lib/taxonomy/store-state";
import { categoryKey } from "@/lib/taxonomy/types";
import type { TaxonomyRequest } from "@/lib/taxonomy/types";

export type TaxonomyDecisionActor = {
  id: string;
  name: string;
};

function dashboardIdConflict(
  store: ReturnType<typeof getStore>,
  kind: TaxonomyRequest["kind"],
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

export function approveTaxonomyRequest(
  requestIdValue: string,
  dashboardId: number,
  actor: TaxonomyDecisionActor,
): { request: TaxonomyRequest; snapshot: TaxonomySnapshot } {
  const store = getStore();
  const request = store.requests.find(
    (candidate) => candidate.id === requestIdValue,
  );
  if (!request) {
    throw new TaxonomyError(
      "REQUEST_NOT_FOUND",
      "طلب التصنيف غير موجود.",
      404,
    );
  }
  if (request.status !== "pending") {
    throw new TaxonomyError(
      "REQUEST_ALREADY_DECIDED",
      "تمت معالجة هذا الطلب بالفعل.",
      409,
    );
  }
  if (!Number.isInteger(dashboardId) || dashboardId <= 0) {
    throw new TaxonomyError(
      "DASHBOARD_ID_REQUIRED",
      "أدخل معرّف لوحة المستهلك الرقمي الرسمي.",
      422,
    );
  }
  if (
    dashboardIdConflict(
      store,
      request.kind,
      dashboardId,
      request.vendorTypeId,
    )
  ) {
    throw new TaxonomyError(
      "DASHBOARD_ID_CONFLICT",
      "هذا المعرّف مستخدم بالفعل في التصنيف المركزي.",
      409,
    );
  }

  const now = isoNow();
  let createdEntityKey: string | null = null;

  if (request.kind === "vendor_type") {
    store.vendorTypes.set(dashboardId, {
      id: dashboardId,
      name_ar: request.name_ar,
      name_en: request.name_en,
      active: true,
      source: "request",
      createdAt: now,
      updatedAt: now,
    });
    createdEntityKey = `vendor_type:${dashboardId}`;
  } else if (request.kind === "category") {
    const vendorTypeId = request.vendorTypeId;
    if (vendorTypeId == null) {
      throw new TaxonomyError(
        "VENDOR_TYPE_REQUIRED",
        "الطلب لا يحتوي على نوع تاجر.",
        422,
      );
    }
    assertVendorTypeExists(vendorTypeId);
    const key = categoryKey(vendorTypeId, dashboardId);
    const siblings = Array.from(store.categories.values()).filter(
      (category) => category.vendorTypeId === vendorTypeId,
    );
    store.categories.set(key, {
      key,
      id: dashboardId,
      vendorTypeId,
      parentId: request.parentId,
      name_ar: request.name_ar,
      name_en: request.name_en,
      sortOrder: siblings.length + 1,
      active: true,
      source: "request",
      createdAt: now,
      updatedAt: now,
    });
    createdEntityKey = `category:${key}`;
  } else {
    store.variants.set(dashboardId, {
      variant_id: dashboardId,
      name_ar: request.name_ar,
      name_en: request.name_en,
      options: [],
      active: true,
      source: "request",
      createdAt: now,
      updatedAt: now,
    });
    createdEntityKey = `variant:${dashboardId}`;
  }

  request.status = "approved";
  request.dashboardId = dashboardId;
  request.decidedBy = actor.id;
  request.decidedByName = actor.name;
  request.decidedAt = now;
  request.createdEntityKey = createdEntityKey;
  bump(store);

  return { request: clone(request), snapshot: taxonomySnapshot() };
}
export function rejectTaxonomyRequest(
  requestIdValue: string,
  reason: string,
  actor: TaxonomyDecisionActor,
): TaxonomyRequest {
  const store = getStore();
  const request = store.requests.find(
    (candidate) => candidate.id === requestIdValue,
  );
  if (!request) {
    throw new TaxonomyError(
      "REQUEST_NOT_FOUND",
      "طلب التصنيف غير موجود.",
      404,
    );
  }
  if (request.status !== "pending") {
    throw new TaxonomyError(
      "REQUEST_ALREADY_DECIDED",
      "تمت معالجة هذا الطلب بالفعل.",
      409,
    );
  }

  request.status = "rejected";
  request.rejectionReason = reason.trim();
  request.decidedBy = actor.id;
  request.decidedByName = actor.name;
  request.decidedAt = isoNow();
  bump(store);
  return clone(request);
}
