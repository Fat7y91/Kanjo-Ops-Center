import { getMerchantById } from "@/lib/field-ops/store";
import type {
  CatalogProduct,
  CatalogProductInput,
  CatalogProductState,
} from "@/lib/catalog/types";

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
  const products: CatalogProduct[] = [
    {
      id: "p-olive-oil",
      name: "زيت زيتون عضوي 1 لتر",
      merchantId: "m-cairo-fresh",
      merchantName: "Cairo Fresh Market",
      price: 480,
      state: "published",
      reviewNote: "سليم",
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: "p-paracetamol",
      name: "باراسيتامول 500 ملجم",
      merchantId: "m-nile-pharmacy",
      merchantName: "Nile Pharmacy Group",
      price: 35,
      state: "published",
      reviewNote: "سليم",
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: "p-family-meal",
      name: "صندوق وجبة عائلية",
      merchantId: "m-zamalek-kitchen",
      merchantName: "Zamalek Kitchen",
      price: 620,
      state: "draft",
      reviewNote: "الصورة معلّقة",
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: "p-towel-set",
      name: "طقم مناشف قطنية",
      merchantId: "m-maadi-home",
      merchantName: "Maadi Home Supplies",
      price: 290,
      state: "published",
      reviewNote: "مراجعة السعر",
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
  ];

  return { products, revision: 1 };
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

  const name = input.name.trim();
  if (
    store.products.some(
      (product) =>
        product.merchantId === merchant.id &&
        product.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new CatalogError(
      "PRODUCT_EXISTS",
      "يوجد منتج بهذا الاسم لهذا التاجر بالفعل.",
      409,
    );
  }

  const now = isoNow();
  const product: CatalogProduct = {
    id: `p-${crypto.randomUUID().slice(0, 8)}`,
    name,
    merchantId: merchant.id,
    merchantName: merchant.name,
    price: input.price,
    state: input.state,
    reviewNote: input.reviewNote.trim() || "بانتظار المراجعة",
    createdAt: now,
    updatedAt: now,
  };

  store.products.push(product);
  store.revision += 1;
  return clone(product);
}

export type { CatalogProductState };
