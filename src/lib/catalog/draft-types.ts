import type {
  CatalogProductType,
  CatalogProductState,
  CatalogVariantSelection,
} from "@/lib/catalog/types";

/** One product as stored in the offline queue, before server acknowledgement. */
export type CatalogDraftPayload = {
  name: string;
  description: string;
  merchantId: string;
  merchantName: string;
  vendorTypeId: number | null;
  categoryKey: string | null;
  /** Resolved MDM category id; required for every queued draft. */
  categoryId: number;
  productType: CatalogProductType;
  sku: string;
  barcode: string;
  imageDataUrl: string | null;
  attributes: CatalogVariantSelection[];
  price: number;
  state: CatalogProductState;
  reviewNote: string;
};

export type CatalogDraft = {
  clientProductId: string;
  payload: CatalogDraftPayload;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
};

export type DraftFlushOutcome = {
  synced: number;
  failed: number;
  remaining: number;
};
