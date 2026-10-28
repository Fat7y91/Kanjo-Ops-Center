import type {
  CatalogProduct,
  CatalogVariantSelection,
} from "@/lib/catalog/types";

/**
 * Seed catalog rows.
 *
 * Kept in `data/` because it is generated-style fixture content, not logic:
 * the store module stays focused on validation and persistence semantics.
 */
const SAMPLE_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#f4f4f5"/><circle cx="300" cy="240" r="110" fill="#230535"/><rect x="170" y="380" width="260" height="34" rx="17" fill="#ffd700"/></svg>',
  );

export function buildCatalogSeed(now: string): CatalogProduct[] {
  const base = {
    description: "",
    vendorTypeId: null,
    categoryKey: null,
    productType: "simple" as const,
    barcode: "",
    imageDataUrl: null,
    attributes: [] as CatalogVariantSelection[],
    clientProductId: null,
  };

  return [
    {
      ...base,
      id: "p-olive-oil",
      name: "زيت زيتون عضوي 1 لتر",
      merchantId: "m-cairo-fresh",
      merchantName: "Cairo Fresh Market",
      price: 480,
      sku: "KJ-04-OLIVE001",
      state: "published",
      reviewNote: "سليم",
      createdAt: now,
      updatedAt: now,
    },
    {
      ...base,
      id: "p-paracetamol",
      name: "باراسيتامول 500 ملجم",
      merchantId: "m-nile-pharmacy",
      merchantName: "Nile Pharmacy Group",
      price: 35,
      sku: "KJ-03-PARA0500",
      state: "published",
      reviewNote: "سليم",
      createdAt: now,
      updatedAt: now,
    },
    {
      ...base,
      id: "p-family-meal",
      name: "صندوق وجبة عائلية",
      merchantId: "m-zamalek-kitchen",
      merchantName: "Zamalek Kitchen",
      price: 620,
      sku: "KJ-01-MEAL0620",
      imageDataUrl: SAMPLE_IMAGE,
      state: "pending_review",
      reviewNote: "الصورة معلّقة",
      createdAt: now,
      updatedAt: now,
    },
    {
      ...base,
      id: "p-towel-set",
      name: "طقم مناشف قطنية",
      merchantId: "m-maadi-home",
      merchantName: "Maadi Home Supplies",
      price: 290,
      sku: "KJ-12-TOWEL290",
      state: "published",
      reviewNote: "مراجعة السعر",
      createdAt: now,
      updatedAt: now,
    },
  ];
}
