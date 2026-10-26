export type CatalogProductState = "draft" | "published";

export type CatalogProduct = {
  id: string;
  name: string;
  merchantId: string;
  merchantName: string;
  price: number;
  state: CatalogProductState;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
};

export type CatalogProductInput = {
  name: string;
  merchantId: string;
  price: number;
  state: CatalogProductState;
  reviewNote: string;
};

export const PRODUCT_STATE_META: Record<
  CatalogProductState,
  { label: string; tone: string }
> = {
  published: { label: "منشور", tone: "badge-green" },
  draft: { label: "مسودة", tone: "badge-gold" },
};
