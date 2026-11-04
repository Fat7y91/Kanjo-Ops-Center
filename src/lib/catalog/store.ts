import { normalizeSearchText } from "@/lib/search/normalize";
import {
  assertCategoryInVendor,
  assertVendorTypeExists,
} from "@/lib/taxonomy/store";
import {
  isCatalogEligibleContract,
  type CatalogAuthor,
  type CatalogProduct,
  type CatalogProductInput,
  type CatalogProductState,
  type CatalogVariantSelection,
} from "@/lib/catalog/types";
import { generateSku, normalizeCode } from "@/lib/catalog/sku";
import {
  applyImageQa,
  type ImageQaPatch,
} from "@/lib/catalog/services/image-qa-service";
import { getMerchantById } from "@/lib/field-ops/store";
import {
  findProductByBarcode,
  findProductByClientId,
  findProductByMerchantName,
  findProductBySku,
  getProductRow,
  insertProduct,
  listProductRows,
  updateProductRow,
} from "./product-repository";

export { ImageQaError } from "@/lib/catalog/services/image-qa-service";

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

/**
 * Monotonic write counter, per isolate.
 *
 * The API echoes it so a client can tell two responses apart, but it is not an
 * authority: the database is. It replaced the old in-memory store revision.
 */
let revision = 1;

export function catalogRevision(): number {
  return revision;
}

function bumpRevision(): void {
  revision += 1;
}

function isoNow(): string {
  return new Date().toISOString();
}

export async function listProducts(): Promise<CatalogProduct[]> {
  const products = await listProductRows();
  return products.sort((left, right) =>
    left.name.localeCompare(right.name, "ar"),
  );
}

/** Ensures a generated SKU never collides with an existing one. */
async function uniqueSku(vendorTypeId: number | null): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateSku(vendorTypeId);
    const existing = await findProductBySku(candidate);
    if (!existing) return candidate;
  }
  throw new CatalogError(
    "SKU_GENERATION_FAILED",
    "تعذر توليد رمز SKU فريد. أعد المحاولة.",
    500,
  );
}

export async function createProduct(
  input: CatalogProductInput,
  author: CatalogAuthor | null = null,
): Promise<CatalogProduct> {
  const merchant = await getMerchantById(input.merchantId);
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
  if (input.clientProductId) {
    const synced = await findProductByClientId(input.clientProductId);
    if (synced) {
      throw new CatalogError(
        "PRODUCT_ALREADY_SYNCED",
        "تمت مزامنة هذه المسودة بالفعل.",
        409,
      );
    }
  }

  const name = input.name.trim();
  const duplicate = await findProductByMerchantName(
    merchant.id,
    normalizeSearchText(name),
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

  // Category is mandatory and must belong to the merchant's vendor type: a
  // product can never be saved "uncategorised" and categorised later.
  if (input.categoryId == null) {
    throw new CatalogError(
      "CATEGORY_REQUIRED",
      "اختر التصنيف قبل حفظ المنتج.",
      422,
    );
  }
  const category = assertCategoryInVendor(vendorTypeId, input.categoryId);
  if (input.categoryKey && input.categoryKey !== category.key) {
    throw new CatalogError(
      "CATEGORY_MISMATCH",
      "التصنيف المحدد لا يطابق معرّف التصنيف.",
      422,
    );
  }
  const categoryKey = category.key;

  const barcode = normalizeCode(input.barcode ?? "");
  if (barcode && (await findProductByBarcode(barcode))) {
    throw new CatalogError(
      "BARCODE_EXISTS",
      "الباركود مستخدم لمنتج آخر بالفعل.",
      409,
    );
  }

  const sku = normalizeCode(input.sku ?? "") || (await uniqueSku(vendorTypeId));
  if (await findProductBySku(sku)) {
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
    enteredById: author?.id ?? null,
    enteredByName: author?.name.trim() || null,
    clientProductId: input.clientProductId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const stored = await insertProduct(product);
  bumpRevision();
  return stored;
}

/**
 * Image QA transition.
 *
 * Delegates the state machine to `applyImageQa` so the rules stay pure and
 * testable; this function only owns persistence and revision bumping.
 */
export async function completeImageQa(
  productId: string,
  patch: ImageQaPatch,
): Promise<CatalogProduct> {
  const product = await getProductRow(productId);
  const updated = applyImageQa(product ?? undefined, patch, isoNow());
  const stored = await updateProductRow(productId, {
    imageDataUrl: updated.imageDataUrl,
    state: updated.state,
    reviewNote: updated.reviewNote,
  });
  bumpRevision();
  return stored ?? updated;
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
export async function syncProducts(
  inputs: SyncProductInput[],
  author: CatalogAuthor | null = null,
): Promise<{ results: SyncProductResult[]; synced: number; failed: number }> {
  const results: SyncProductResult[] = [];
  let synced = 0;
  let failed = 0;

  for (const input of inputs) {
    try {
      const product = await createProduct(input, author);
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

export type { CatalogProductState, CatalogVariantSelection };
