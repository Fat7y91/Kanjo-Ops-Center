import { getMerchantById } from "@/lib/field-ops/store";
import { normalizeSearchText } from "@/lib/search/normalize";
import {
  assertCategoryInVendor,
  assertVendorTypeExists,
  listCategories,
} from "@/lib/taxonomy/store";
import {
  isCatalogEligibleContract,
  type CatalogProduct,
  type CatalogProductInput,
  type CatalogProductState,
  type CatalogVariantSelection,
} from "@/lib/catalog/types";
import { generateSku, normalizeCode } from "@/lib/catalog/sku";
import { buildCatalogSeed } from "@/lib/catalog/data/seed";

export class CatalogError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.status = status;
  }
}

type CatalogStore = {
  products: CatalogProduct[];
  revision: number;
};

const globalStore = globalThis as typeof globalThis & {
  __kanjoV2CatalogStore?: CatalogStore;
};

function isoNow(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function seedStore(): CatalogStore {
  return { products: buildCatalogSeed(isoNow()), revision: 1 };
}

function getStore(): CatalogStore {
  if (!globalStore.__kanjoV2CatalogStore) {
    globalStore.__kanjoV2CatalogStore = seedStore();
  }
  return globalStore.__kanjoV2CatalogStore;
}

export function catalogRevision(): number {
  return getStore().revision;
}

export function listProducts(): CatalogProduct[] {
  return clone(getStore().products).sort((left, right) =>
    left.name.localeCompare(right.name, "ar"),
  );
}

/** Ensures a generated SKU never collides with an existing one. */
function uniqueSku(vendorTypeId: number | null): string {
  const existing = new Set(getStore().products.map((product) => product.sku));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateSku(vendorTypeId);
    if (!existing.has(candidate)) return candidate;
  }
  throw new CatalogError(
    "SKU_GENERATION_FAILED",
    "تعذر توليد رمز SKU فريد. أعد المحاولة.",
    500,
  );
}

export function createProduct(input: CatalogProductInput): CatalogProduct {
  const store = getStore();
  const merchant = getMerchantById(input.merchantId);
  if (!merchant) {
    throw new CatalogError(
      "MERCHANT_NOT_FOUND",
      "التاجر المحدد غير موجود.",
      404,
    );
  }

  if (!isCatalogEligibleContract(merchant.contractState)) {
    throw new CatalogError(
      "MERCHANT_NOT_ELIGIBLE",
      "لا يمكن إضافة منتجات إلا لتاجر بعقد نهائي أو موقّع.",
      422,
    );
  }

  // Replay guard: an identical client id means this exact draft was already
  // accepted, so the queue can safely drop it without double-creating.
  if (
    input.clientProductId &&
    store.products.some(
      (product) => product.clientProductId === input.clientProductId,
    )
  ) {
    throw new CatalogError(
      "PRODUCT_ALREADY_SYNCED",
      "تمت مزامنة هذه المسودة بالفعل.",
      409,
    );
  }

  const name = input.name.trim();
  const duplicate = store.products.some(
    (product) =>
      product.merchantId === merchant.id &&
      normalizeSearchText(product.name) === normalizeSearchText(name),
  );
  if (duplicate) {
    throw new CatalogError(
      "PRODUCT_EXISTS",
      "يوجد منتج بهذا الاسم لهذا التاجر بالفعل.",
      409,
    );
  }

  const vendorTypeId = input.vendorTypeId ?? merchant.vendorTypeId;
  assertVendorTypeExists(vendorTypeId);

  let categoryKey: string | null = null;
  if (input.categoryKey) {
    const category = listCategories(vendorTypeId).find(
      (candidate) => candidate.key === input.categoryKey,
    );
    if (!category) {
      throw new CatalogError(
        "CATEGORY_NOT_IN_VENDOR_SCOPE",
        "التصنيف غير تابع لنوع التاجر المحدد.",
        422,
      );
    }
    assertCategoryInVendor(vendorTypeId, category.id);
    categoryKey = category.key;
  } else if (input.categoryId != null) {
    categoryKey = assertCategoryInVendor(vendorTypeId, input.categoryId).key;
  }

  const barcode = normalizeCode(input.barcode ?? "");
  if (
    barcode &&
    store.products.some((product) => product.barcode === barcode)
  ) {
    throw new CatalogError(
      "BARCODE_EXISTS",
      "الباركود مستخدم لمنتج آخر بالفعل.",
      409,
    );
  }

  const sku = normalizeCode(input.sku ?? "") || uniqueSku(vendorTypeId);
  if (store.products.some((product) => product.sku === sku)) {
    throw new CatalogError("SKU_EXISTS", "رمز SKU مستخدم بالفعل.", 409);
  }

  const now = isoNow();
  const product: CatalogProduct = {
    id: `p-${crypto.randomUUID().slice(0, 8)}`,
    name,
    description: (input.description ?? "").trim(),
    merchantId: merchant.id,
    merchantName: merchant.name,
    vendorTypeId,
    categoryKey,
    productType: input.productType ?? "simple",
    sku,
    barcode,
    imageDataUrl: input.imageDataUrl ?? null,
    attributes: input.attributes ?? [],
    price: input.price,
    state: input.state,
    reviewNote: input.reviewNote.trim() || "بانتظار المراجعة",
    clientProductId: input.clientProductId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  store.products.push(product);
  store.revision += 1;
  return clone(product);
}

export type SyncProductResult = {
  clientProductId: string | null;
  status: "synced" | "duplicate" | "failed";
  productId?: string;
  error?: string;
};

export type SyncProductInput = CatalogProductInput & {
  clientProductId?: string | null;
};

/**
 * Batch upsert used by the offline draft queue.
 *
 * Each entry is attempted independently: one bad product must never block the
 * rest of the batch, and anything that fails is reported back so the client can
 * keep it queued for a later retry.
 */
export function syncProducts(
  inputs: SyncProductInput[],
): { results: SyncProductResult[]; synced: number; failed: number } {
  const results: SyncProductResult[] = [];
  let synced = 0;
  let failed = 0;

  for (const input of inputs) {
    try {
      const product = createProduct(input);
      results.push({
        clientProductId: input.clientProductId ?? null,
        status: "synced",
        productId: product.id,
      });
      synced += 1;
    } catch (error) {
      if (
        error instanceof CatalogError &&
        error.code === "PRODUCT_ALREADY_SYNCED"
      ) {
        // Same client id from an earlier replay: idempotent success, so the
        // client can drop it instead of retrying forever.
        results.push({
          clientProductId: input.clientProductId ?? null,
          status: "duplicate",
        });
        synced += 1;
        continue;
      }
      // A same-name product under the same merchant is a real conflict, not a
      // replay. It must stay queued so the rep can resolve it by hand.

      results.push({
        clientProductId: input.clientProductId ?? null,
        status: "failed",
        error:
          error instanceof Error ? error.message : "تعذر رفع المنتج.",
      });
      failed += 1;
    }
  }

  return { results, synced, failed };
}

export type { CatalogProductState };
