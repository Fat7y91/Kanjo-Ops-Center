export type CatalogProductState =
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
  /**
   * Who entered the product. Kept on the row because the catalog attributes
   * entry volume per rep, and the draft queue can flush hours after the rep
   * created it.
   */
  enteredById: string | null;
  enteredByName: string | null;
  /** Client-generated id echoed back so offline replays stay idempotent. */
  clientProductId: string | null;
  /**
   * V1 image provenance copied verbatim: image_locked_by/_at,
   * image_uploaded_by/_at, edit_type, edited_by/_at, upload history and
   * delete-request state. Empty for V2-native products.
   */
  qaMetadata: CatalogProductQaMetadata;
  createdAt: string;
  updatedAt: string;
};

/** Known V1 image-QA provenance keys. Unknown keys are still preserved. */
export type CatalogProductQaMetadata = {
  image_locked_by?: string;
  image_locked_at?: string;
  image_uploaded_by?: string;
  image_uploaded_at?: string;
  edit_type?: string;
  edited_by?: string;
  edited_at?: string;
  upload_history?: unknown;
  delete_request?: unknown;
  [key: string]: unknown;
};

/** Identity of the person creating a product, taken from the session. */
export type CatalogAuthor = {
  id: string;
  name: string;
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
