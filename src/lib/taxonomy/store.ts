import {
  CATEGORY_SEED,
  VARIANT_SEED,
  VENDOR_TYPE_SEED,
} from "@/lib/taxonomy/data.generated";
import {
  categoryKey,
  type TaxonomyCategory,
  type TaxonomyKind,
  type TaxonomyRequest,
  type TaxonomyVariant,
  type TaxonomyVendorType,
} from "@/lib/taxonomy/types";
import { normalizeSearchText } from "@/lib/search/normalize";

export class TaxonomyError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "TaxonomyError";
    this.code = code;
    this.status = status;
  }
}

type TaxonomyStore = {
  vendorTypes: Map<number, TaxonomyVendorType>;
  categories: Map<string, TaxonomyCategory>;
  variants: Map<number, TaxonomyVariant>;
  requests: TaxonomyRequest[];
  revision: number;
};

export type TaxonomySnapshot = {
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  revision: number;
};

export type TaxonomyRequestActor = {
  id: string;
  name: string;
};

const globalStore = globalThis as typeof globalThis & {
  __kanjoV2TaxonomyStore?: TaxonomyStore;
};

function isoNow(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requestId(): string {
  return `taxreq-${crypto.randomUUID().slice(0, 8)}`;
}

function seedStore(): TaxonomyStore {
  const createdAt = new Date(0).toISOString();
  const vendorTypes = new Map<number, TaxonomyVendorType>(
    VENDOR_TYPE_SEED.map((vendor) => [
      vendor.id,
      {
        id: vendor.id,
        name_ar: vendor.name_ar,
        name_en: vendor.name_en,
        active: true,
        source: "dashboard" as const,
        createdAt,
        updatedAt: createdAt,
      },
    ]),
  );

  const categories = new Map<string, TaxonomyCategory>(
    CATEGORY_SEED.map((category) => [
      categoryKey(category.vendor_type_id, category.id),
      {
        key: categoryKey(category.vendor_type_id, category.id),
        id: category.id,
        vendorTypeId: category.vendor_type_id,
        parentId: category.parent_id,
        name_ar: category.name_ar,
        name_en: category.name_en,
        sortOrder: category.sort_order,
        active: category.active,
        source: "dashboard" as const,
        createdAt,
        updatedAt: createdAt,
      },
    ]),
  );

  const variants = new Map<number, TaxonomyVariant>(
    VARIANT_SEED.map((variant) => [
      variant.variant_id,
      {
        variant_id: variant.variant_id,
        name_ar: variant.name_ar,
        name_en: variant.name_en,
        options: variant.options.map((option) => ({
          ...option,
          aliases: [...option.aliases],
        })),
        active: true,
        source: "dashboard" as const,
        createdAt,
        updatedAt: createdAt,
      },
    ]),
  );

  const now = isoNow();
  const requests: TaxonomyRequest[] = [
    {
      id: "taxreq-seed-pharmacy-lab",
      kind: "category",
      name_ar: "تحاليل منزلية",
      name_en: "Home Lab Tests",
      justification:
        "طلبات متزايدة من صيدليات القاهرة على تسجيل خدمات التحاليل المنزلية كتصنيف مستقل.",
      vendorTypeId: 3,
      parentId: null,
      status: "pending",
      requestedBy: "u-sales",
      requestedByName: "Omar Khaled",
      requestedAt: now,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      dashboardId: null,
      rejectionReason: "",
      createdEntityKey: null,
    },
    {
      id: "taxreq-seed-vet-grooming",
      kind: "vendor_type",
      name_ar: "خدمات بيطرية",
      name_en: "Veterinary Services",
      justification:
        "عيادات بيطرية تطلب الانضمام كقطاع منفصل عن أدوية بيطرية.",
      vendorTypeId: null,
      parentId: null,
      status: "pending",
      requestedBy: "u-ops",
      requestedByName: "Mariam Adel",
      requestedAt: now,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      dashboardId: null,
      rejectionReason: "",
      createdEntityKey: null,
    },
  ];

  return { vendorTypes, categories, variants, requests, revision: 1 };
}

function getStore(): TaxonomyStore {
  if (!globalStore.__kanjoV2TaxonomyStore) {
    globalStore.__kanjoV2TaxonomyStore = seedStore();
  }
  return globalStore.__kanjoV2TaxonomyStore;
}

function bump(store: TaxonomyStore): void {
  store.revision += 1;
}

export function taxonomyRevision(): number {
  return getStore().revision;
}

export function listVendorTypes(): TaxonomyVendorType[] {
  return clone(
    Array.from(getStore().vendorTypes.values()).sort(
      (left, right) => left.id - right.id,
    ),
  );
}

export function listCategories(vendorTypeId?: number): TaxonomyCategory[] {
  const all = Array.from(getStore().categories.values());
  const scoped =
    vendorTypeId === undefined
      ? all
      : all.filter((category) => category.vendorTypeId === vendorTypeId);
  return clone(
    scoped.sort(
      (left, right) =>
        left.vendorTypeId - right.vendorTypeId ||
        left.sortOrder - right.sortOrder ||
        left.id - right.id,
    ),
  );
}

export function listVariants(): TaxonomyVariant[] {
  return clone(
    Array.from(getStore().variants.values()).sort(
      (left, right) => left.variant_id - right.variant_id,
    ),
  );
}

export function taxonomySnapshot(): TaxonomySnapshot {
  return {
    vendorTypes: listVendorTypes(),
    categories: listCategories(),
    variants: listVariants(),
    revision: taxonomyRevision(),
  };
}

export function getVendorType(id: number): TaxonomyVendorType | null {
  const vendor = getStore().vendorTypes.get(id);
  return vendor ? clone(vendor) : null;
}

export function getCategory(
  vendorTypeId: number,
  id: number,
): TaxonomyCategory | null {
  const category = getStore().categories.get(categoryKey(vendorTypeId, id));
  return category ? clone(category) : null;
}

export function findVendorTypeByName(name: string): TaxonomyVendorType | null {
  const target = normalizeSearchText(name);
  if (!target) return null;
  for (const vendor of getStore().vendorTypes.values()) {
    if (
      normalizeSearchText(vendor.name_ar) === target ||
      normalizeSearchText(vendor.name_en) === target
    ) {
      return clone(vendor);
    }
  }
  return null;
}

export function assertVendorTypeExists(id: number): TaxonomyVendorType {
  const vendor = getStore().vendorTypes.get(id);
  if (!vendor) {
    throw new TaxonomyError(
      "VENDOR_TYPE_NOT_FOUND",
      "نوع التاجر غير موجود في التصنيف المركزي.",
      404,
    );
  }
  return clone(vendor);
}

export function assertCategoryInVendor(
  vendorTypeId: number,
  categoryId: number,
): TaxonomyCategory {
  const category = getStore().categories.get(
    categoryKey(vendorTypeId, categoryId),
  );
  if (!category) {
    throw new TaxonomyError(
      "CATEGORY_NOT_IN_VENDOR_SCOPE",
      "التصنيف غير تابع لنوع التاجر المحدد.",
      422,
    );
  }
  return clone(category);
}

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

export type TaxonomyDecisionActor = {
  id: string;
  name: string;
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

export function pendingTaxonomyRequestCount(): number {
  return getStore().requests.filter((request) => request.status === "pending")
    .length;
}
