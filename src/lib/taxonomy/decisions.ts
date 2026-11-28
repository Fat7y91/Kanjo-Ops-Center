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

/**
 * Links a pending request to a record that already exists centrally.
 *
 * The central dashboard sheet is the only way an entry is created. This step
 * therefore never inserts taxonomy data: it confirms the uploaded record is
 * present under the supplied Dashboard ID and closes the request against it.
 * Approving before the sync lands fails loudly instead of inventing a record.
 */
export function markTaxonomyRequestAdded(
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

  let createdEntityKey: string;
  if (request.kind === "vendor_type") {
    if (!store.vendorTypes.has(dashboardId)) {
      throw new TaxonomyError(
        "ENTRY_NOT_SYNCED",
        "لا يوجد نوع تاجر بهذا المعرّف. ارفع ملف مزامنة لوحة التحكم أولاً.",
        409,
      );
    }
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
    if (!store.categories.has(key)) {
      throw new TaxonomyError(
        "ENTRY_NOT_SYNCED",
        "لا يوجد تصنيف بهذا المعرّف داخل نوع التاجر. ارفع ملف مزامنة لوحة التحكم أولاً.",
        409,
      );
    }
    createdEntityKey = `category:${key}`;
  } else {
    if (!store.variants.has(dashboardId)) {
      throw new TaxonomyError(
        "ENTRY_NOT_SYNCED",
        "لا توجد مجموعة متغيرات بهذا المعرّف. ارفع ملف مزامنة لوحة التحكم أولاً.",
        409,
      );
    }
    createdEntityKey = `variant:${dashboardId}`;
  }

  request.status = "approved";
  request.dashboardId = dashboardId;
  request.decidedBy = actor.id;
  request.decidedByName = actor.name;
  request.decidedAt = isoNow();
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
