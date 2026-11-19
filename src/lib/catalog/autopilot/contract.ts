import { z } from "zod";

const itemBase = {
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(300),
  unit: z.string().trim().max(80).default(""),
  barcode: z.string().trim().max(64).default(""),
  priceMinor: z.number().int().positive().max(10_000_000_000),
};

export const autopilotEnrichRequestSchema = z.object({
  merchantId: z.string().trim().min(1).max(80),
  items: z.array(z.object(itemBase)).min(1).max(8),
});

export const autopilotSaveRequestSchema = z.object({
  merchantId: z.string().trim().min(1).max(80),
  items: z
    .array(
      z.object({
        ...itemBase,
        categoryKey: z.string().trim().min(1).max(40),
        imageDataUrl: z.string().trim().max(4000).nullable().default(null),
        imageSource: z.enum([
          "master_catalog",
          "web_search",
          "existing",
          "no_image",
        ]),
        imageUrlRaw: z.string().trim().max(3000).nullable().optional(),
        masterCatalogId: z.string().trim().max(80).nullable().default(null),
      }),
    )
    .min(1)
    .max(25),
});

export type AutopilotEnrichRequest = z.infer<
  typeof autopilotEnrichRequestSchema
>;
export type AutopilotSaveRequest = z.infer<
  typeof autopilotSaveRequestSchema
>;
