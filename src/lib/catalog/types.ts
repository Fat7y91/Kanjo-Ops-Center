export type CatalogProductState =
  | "draft"
  | "pending_review"
  | "completed"
  | "published";

/** Taxonomy-mandated product shape. No free-form values are accepted. */
export type CatalogProductType = "simple" | "variable";

export type CatalogVariantSelection = {
  variantId: number;
  optionIds: number[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  merchantId: string;
  merchantName: string;
  vendorTypeId: number | null;
  categoryKey: string | null;
  productType: CatalogProductType;
  sku: string;
  barcode: string;
  imageDataUrl: string | null;
  attributes: CatalogVariantSelection[];
  price: number;
  state: CatalogProductState;
  reviewNote: string;
  /** Client-generated id echoed back so offline replays stay idempotent. */
  clientProductId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogProductInput = {
  name: string;
  description?: string;
  merchantId: string;
  vendorTypeId?: number | null;
  categoryKey?: string | null;
  /** Mandatory MDM category — products without one are rejected. */
  categoryId: number;
  productType?: CatalogProductType;
  sku?: string;
  barcode?: string;
  imageDataUrl?: string | null;
  attributes?: CatalogVariantSelection[];
  price: number;
  state: CatalogProductState;
  reviewNote: string;
  clientProductId?: string | null;
};

export const PRODUCT_TYPE_META: Record<
  CatalogProductType,
  { label: string; description: string }
> = {
  simple: {
    label: "بسيط",
    description: "منتج واحد بدون خيارات متغيرة.",
  },
  variable: {
    label: "متغير",
    description: "منتج له خيارات مثل الحجم أو الطعم.",
  },
};

export const PRODUCT_STATE_META: Record<
  CatalogProductState,
  { label: string; tone: string }
> = {
  draft: { label: "مسودة", tone: "badge" },
  pending_review: { label: "بانتظار المراجعة", tone: "badge-gold" },
  completed: { label: "مكتمل", tone: "badge-blue" },
  published: { label: "منشور", tone: "badge-green" },
};

/** Review states that expose the Image QA action bar. */
export const IMAGE_QA_STATES: readonly CatalogProductState[] = [
  "pending_review",
];

export function needsImageQa(state: CatalogProductState): boolean {
  return IMAGE_QA_STATES.includes(state);
}

/** Contract states that are allowed to add products to the catalog. */
export const CATALOG_ELIGIBLE_CONTRACT_STATES = [
  "final_contract",
  "signed_contract",
] as const;

export type CatalogEligibleContractState =
  (typeof CATALOG_ELIGIBLE_CONTRACT_STATES)[number];

export function isCatalogEligibleContract(state: string): boolean {
  return (CATALOG_ELIGIBLE_CONTRACT_STATES as readonly string[]).includes(state);
}
