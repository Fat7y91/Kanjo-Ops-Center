import { z } from "zod";

export const catalogProductTypeSchema = z.enum(["simple", "variable"]);

export const catalogVariantSelectionSchema = z.object({
  variantId: z.number().int().positive(),
  optionIds: z.array(z.number().int().positive()).default([]),
});

const baseProductFields = {
  name: z.string().trim().min(2, "اسم المنتج مطلوب.").max(140),
  description: z.string().trim().max(2000).default(""),
  merchantId: z.string().trim().min(1, "اختر التاجر."),
  vendorTypeId: z.number().int().positive().nullable().optional(),
  categoryKey: z.string().trim().max(40).nullable().optional(),
  /** MDM category is mandatory: a product can never be categorised later. */
  categoryId: z
    .number({ required_error: "التصنيف مطلوب." })
    .int()
    .positive("التصنيف مطلوب."),
  productType: catalogProductTypeSchema.default("simple"),
  sku: z.string().trim().max(64).default(""),
  barcode: z
    .string()
    .trim()
    .max(64)
    .refine(
      (value) => value === "" || /^\d{8,14}$/.test(value),
      "الباركود يجب أن يكون من 8 إلى 14 رقماً.",
    )
    .default(""),
  imageDataUrl: z.string().max(3_000_000).nullable().optional(),
  attributes: z.array(catalogVariantSelectionSchema).default([]),
  price: z.coerce
    .number()
    .min(0, "السعر لا يمكن أن يكون سالباً.")
    .max(100_000_000),
  state: z.enum(["draft", "published"]).default("draft"),
  reviewNote: z.string().trim().max(500).default(""),
};

export const productCreateSchema = z.object(baseProductFields);

export const catalogSyncSchema = z.object({
  drafts: z
    .array(
      z.object({
        clientProductId: z.string().trim().min(1).max(80),
        ...baseProductFields,
      }),
    )
    .min(1, "لا توجد مسودات للرفع.")
    .max(100, "الحد الأقصى 100 منتج في الدفعة الواحدة."),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type CatalogSyncInput = z.infer<typeof catalogSyncSchema>;
