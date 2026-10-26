import { z } from "zod";

export const TAXONOMY_KINDS = ["vendor_type", "category", "variant"] as const;

const dashboardIdSchema = z.coerce
  .number()
  .int("معرّف لوحة المستهلك يجب أن يكون رقماً صحيحاً.")
  .positive("معرّف لوحة المستهلك يجب أن يكون أكبر من صفر.")
  .max(9_999_999);

export const taxonomyRequestCreateSchema = z
  .object({
    kind: z.enum(TAXONOMY_KINDS),
    name_ar: z.string().trim().min(2, "الاسم العربي مطلوب.").max(120),
    name_en: z.string().trim().max(120).default(""),
    justification: z
      .string()
      .trim()
      .min(10, "اذكر مبرر الإضافة (10 أحرف على الأقل).")
      .max(2000),
    vendorTypeId: dashboardIdSchema.nullish(),
    parentId: dashboardIdSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "category" && value.vendorTypeId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vendorTypeId"],
        message: "اختر نوع التاجر الذي يتبع له التصنيف.",
      });
    }
  });

export const taxonomyApproveSchema = z.object({
  dashboardId: dashboardIdSchema,
});

export const taxonomyRejectSchema = z.object({
  reason: z.string().trim().min(5, "اذكر سبب الرفض.").max(1000),
});

export type TaxonomyRequestCreateInput = z.infer<
  typeof taxonomyRequestCreateSchema
>;
export type TaxonomyApproveInput = z.infer<typeof taxonomyApproveSchema>;
export type TaxonomyRejectInput = z.infer<typeof taxonomyRejectSchema>;

export const taxonomyDirectCreateSchema = z
  .object({
    kind: z.enum(TAXONOMY_KINDS),
    name_ar: z.string().trim().min(2, "الاسم العربي مطلوب.").max(120),
    name_en: z.string().trim().max(120).default(""),
    dashboardId: dashboardIdSchema,
    vendorTypeId: dashboardIdSchema.nullish(),
    parentId: dashboardIdSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "category" && value.vendorTypeId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vendorTypeId"],
        message: "اختر نوع التاجر الذي يتبع له التصنيف.",
      });
    }
  });

export type TaxonomyDirectCreateInput = z.infer<
  typeof taxonomyDirectCreateSchema
>;
