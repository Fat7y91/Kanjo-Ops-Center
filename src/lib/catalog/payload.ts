import { z } from "zod";

/**
 * Wire contract for `GET /api/catalog/products`.
 *
 * Validated field by field: the grid prints the price and the review state
 * straight from these rows, so a renamed key has to fail at the boundary rather
 * than render an empty cell that looks like missing data.
 */
export const catalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  merchantId: z.string(),
  merchantName: z.string(),
  vendorTypeId: z.number().nullable(),
  categoryKey: z.string().nullable(),
  productType: z.enum(["simple", "variable"]),
  sku: z.string(),
  barcode: z.string(),
  imageDataUrl: z.string().nullable(),
  attributes: z.array(
    z.object({ variantId: z.number(), optionIds: z.array(z.number()) }),
  ),
  price: z.number(),
  state: z.enum(["pending_review", "completed", "published"]),
  reviewNote: z.string(),
  enteredById: z.string().nullable(),
  enteredByName: z.string().nullable(),
  clientProductId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const catalogProductsPayloadSchema = z.object({
  products: z.array(catalogProductSchema),
  revision: z.number(),
});

export type CatalogProductsPayload = z.infer<typeof catalogProductsPayloadSchema>;
