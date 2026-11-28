import { z } from "zod";

export const catalogProductTypeSchema = z.enum(["simple", "variable"]);

export const catalogProductStateSchema = z.enum([
  "pending_review",
  "completed",
  "published",
]);

/** Preserves explicit null while still accepting numeric strings. */
const nullableNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? null : value), schema.nullable());

export const catalogVariantSelectionSchema = z.object({
  variantId: z.number().int().positive().nullable().optional(),
  optionIds: z.array(z.number().int().positive()).default([]),
  variantLabel: z.string().trim().max(160).optional(),
  price_minor: nullableNumber(
    z.coerce.number().int().min(0).max(10_000_000_000),
  ).optional(),
  sku: z.string().trim().max(64).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  available: z.boolean().optional(),
  image_url: z.string().max(3_000).nullable().optional(),
});

/** Editable variant row accepted by PATCH /api/catalog/products/[id]. */
export const catalogVariantEditSchema = z.object({
  variantId: z.number().int().positive().nullable().optional(),
  optionIds: z.array(z.number().int().positive()).default([]),
  label: z.string().trim().max(160).default(""),
  price: z.coerce
    .number()
    .min(0, "سعر المتغير لا يمكن أن يكون سالباً.")
    .max(100_000_000),
  sku: z.string().trim().max(64).default(""),
  barcode: z
    .string()
    .trim()
    .max(64)
    .refine(
      (value) => value === "" || /^\d{8,14}$/.test(value),
      "باركود المتغير يجب أن يكون من 8 إلى 14 رقماً.",
    )
    .default(""),
  available: z.boolean().default(true),
  imageUrl: z.string().max(3_000).nullable().optional(),
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
  unit: z.string().trim().max(80).default(""),
  stockQuantity: nullableNumber(z.coerce.number().int().min(0)).optional(),
  compareAtPrice: nullableNumber(
    z.coerce.number().min(0).max(100_000_000),
  ).optional(),
  state: catalogProductStateSchema.default("pending_review"),
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

export const productUpdateSchema = z.object({
  name: z.string().trim().min(2, "اسم المنتج مطلوب.").max(140),
  description: z.string().trim().max(2000).default(""),
  categoryId: z
    .number({ required_error: "التصنيف مطلوب." })
    .int()
    .positive("التصنيف مطلوب."),
  sku: z.string().trim().max(64).default(""),
  barcode: z
    .string()
    .trim()
    .max(64)
    .refine(
      (value) => value === "" || /^\d{1,64}$/.test(value),
      "الباركود يجب أن يحتوي أرقاماً فقط.",
    )
    .default(""),
  imageDataUrl: z.string().max(3_000_000).nullable().optional(),
  price: z.coerce
    .number()
    .min(0, "السعر لا يمكن أن يكون سالباً.")
    .max(100_000_000)
    .optional(),
  unit: z.string().trim().max(80).optional(),
  stockQuantity: nullableNumber(z.coerce.number().int().min(0)).optional(),
  compareAtPrice: nullableNumber(
    z.coerce.number().min(0).max(100_000_000),
  ).optional(),
  productType: catalogProductTypeSchema.optional(),
  variants: z.array(catalogVariantEditSchema).max(60).optional(),
  state: catalogProductStateSchema.optional(),
  reviewNote: z.string().trim().max(500).optional(),
});

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const catalogImageUploadSchema = z.object({
  dataUrl: z
    .string()
    .min(32)
    .max(3_000_000)
    .regex(
      /^data:image\/(?:jpeg|png|webp);base64,/i,
      "صيغة الصورة غير مدعومة.",
    ),
  merchantId: z.string().trim().max(80).nullable().optional(),
});

export type CatalogImageUploadInput = z.infer<
  typeof catalogImageUploadSchema
>;

/**
 * One mirror batch. Five or six products per request keeps each Worker
 * invocation inside its subrequest and CPU budget while still making visible
 * progress on a large catalog.
 */
export const catalogMirrorImagesSchema = z.object({
  merchantId: z.string().trim().min(1, "التاجر مطلوب.").max(80),
  productIds: z
    .array(z.string().trim().min(1).max(80))
    .min(1, "لا توجد منتجات للتوطين.")
    .max(6, "الحد الأقصى 6 منتجات في الدفعة الواحدة."),
});

export type CatalogMirrorImagesInput = z.infer<
  typeof catalogMirrorImagesSchema
>;
