import { z } from "zod";

import { whatsappNumber } from "@/lib/field-ops/whatsapp";
import { readApplicationFields } from "@/lib/merchant-applications/input";
import type { MerchantApplicationInput } from "@/lib/merchant-applications/types";

/**
 * Validation for `POST /api/public/merchants/apply`.
 *
 * The payload arrives from a page we do not deploy, so every field is checked
 * here before anything reaches the database; the table constraints stay as the
 * second line of defence for writes that bypass this route.
 */

const NAME = { min: 2, max: 160 } as const;

export const merchantApplicationSchema = z.object({
  storeName: z
    .string()
    .trim()
    .min(NAME.min, "اسم المتجر مطلوب.")
    .max(NAME.max, "اسم المتجر أطول من الحد المسموح."),
  contactPerson: z
    .string()
    .trim()
    .min(NAME.min, "اسم المسؤول مطلوب.")
    .max(120, "اسم المسؤول أطول من الحد المسموح."),
  // Stored in international digits so the review queue can dial it and match
  // repeats: "01012345678" and "+20 101 234 5678" both become "201012345678".
  phoneNumber: z
    .string()
    .trim()
    .min(1, "رقم الهاتف مطلوب.")
    .max(24, "رقم الهاتف أطول من الحد المسموح.")
    .transform((value) => whatsappNumber(value) ?? "")
    .refine(
      (value) => /^[0-9]{8,15}$/.test(value),
      "أدخل رقم هاتف صحيحاً.",
    ),
  businessType: z
    .string()
    .trim()
    .min(NAME.min, "نوع النشاط مطلوب.")
    .max(120, "نوع النشاط أطول من الحد المسموح."),
});

/**
 * Normalises the body, then validates it. Throws `ZodError`, which
 * `apiError()` already turns into a 422 with the first field message.
 */
export function parseMerchantApplication(body: unknown): MerchantApplicationInput {
  return merchantApplicationSchema.parse(readApplicationFields(body));
}
