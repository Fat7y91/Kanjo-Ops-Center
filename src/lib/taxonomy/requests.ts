import { normalizeSearchText } from "@/lib/search/normalize";
import { TaxonomyError } from "@/lib/taxonomy/errors";
import { assertVendorTypeExists } from "@/lib/taxonomy/catalog";
import {
  bump,
  clone,
  getStore,
  isoNow,
  requestId,
} from "@/lib/taxonomy/store-state";
import type { TaxonomyKind, TaxonomyRequest } from "@/lib/taxonomy/types";

export type TaxonomyRequestActor = {
  id: string;
  name: string;
};

/**
 * Review queue reads and submissions.
 *
 * A field operator submits a request here; the decision paths (link to a
 * synced record, or reject) live in `decisions.ts`, and direct entry creation
 * in `entries.ts`. Nothing in this module writes taxonomy reference data.
 */

export function listTaxonomyRequests(status?: "pending" | "approved" | "rejected"): TaxonomyRequest[] {
  const all = clone(getStore().requests).sort((left, right) =>
    right.requestedAt.localeCompare(left.requestedAt),
  );
  return status ? all.filter((request) => request.status === status) : all;
}

export function getTaxonomyRequest(id: string): TaxonomyRequest | null {
  const request = getStore().requests.find((candidate) => candidate.id === id);
  return request ? clone(request) : null;
}

export type TaxonomyRequestInput = {
  kind: TaxonomyKind;
  name_ar: string;
  name_en: string;
  justification: string;
  vendorTypeId?: number | null;
  parentId?: number | null;
};

export function createTaxonomyRequest(
  input: TaxonomyRequestInput,
  actor: TaxonomyRequestActor,
): TaxonomyRequest {
  const store = getStore();
  const normalized = normalizeSearchText(input.name_ar);

  if (input.kind === "category") {
    if (input.vendorTypeId == null) {
      throw new TaxonomyError(
        "VENDOR_TYPE_REQUIRED",
        "اختر نوع التاجر الذي يتبع له التصنيف المقترح.",
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
  }

  if (input.kind === "vendor_type") {
    const duplicate = Array.from(store.vendorTypes.values()).some(
      (vendor) => normalizeSearchText(vendor.name_ar) === normalized,
    );
    if (duplicate) {
      throw new TaxonomyError(
        "VENDOR_TYPE_EXISTS",
        "نوع التاجر هذا موجود بالفعل في التصنيف المركزي.",
        409,
      );
    }
  }

  if (input.kind === "variant") {
    const duplicate = Array.from(store.variants.values()).some(
      (variant) => normalizeSearchText(variant.name_ar) === normalized,
    );
    if (duplicate) {
      throw new TaxonomyError(
        "VARIANT_EXISTS",
        "مجموعة المتغيرات هذه موجودة بالفعل في التصنيف المركزي.",
        409,
      );
    }
  }

  const pendingDuplicate = store.requests.some(
    (request) =>
      request.status === "pending" &&
      request.kind === input.kind &&
      normalizeSearchText(request.name_ar) === normalized &&
      (input.kind !== "category" ||
        request.vendorTypeId === (input.vendorTypeId ?? null)),
  );
  if (pendingDuplicate) {
    throw new TaxonomyError(
      "REQUEST_PENDING",
      "يوجد طلب مطابق قيد المراجعة بالفعل.",
      409,
    );
  }

  const request: TaxonomyRequest = {
    id: requestId(),
    kind: input.kind,
    name_ar: input.name_ar.trim(),
    name_en: input.name_en.trim(),
    justification: input.justification.trim(),
    vendorTypeId: input.vendorTypeId ?? null,
    parentId: input.parentId ?? null,
    status: "pending",
    requestedBy: actor.id,
    requestedByName: actor.name,
    requestedAt: isoNow(),
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    dashboardId: null,
    rejectionReason: "",
    createdEntityKey: null,
  };

  store.requests.push(request);
  bump(store);
  return clone(request);
}

export function pendingTaxonomyRequestCount(): number {
  return getStore().requests.filter((request) => request.status === "pending")
    .length;
}
