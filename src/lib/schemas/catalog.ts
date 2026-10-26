import { z } from "zod";

export const productCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم المنتج مطلوب.").max(140),
  merchantId: z.string().trim().min(1, "اختر التاجر."),
  price: z.coerce
    .number()
    .min(0, "السعر لا يمكن أن يكون سالباً.")
    .max(100_000_000),
  state: z.enum(["draft", "published"]).default("draft"),
  reviewNote: z.string().trim().max(500).default(""),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
