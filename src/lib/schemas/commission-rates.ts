import { z } from "zod";

/**
 * A fee is a non-negative EGP amount (`numeric(12, 2)` in Postgres). An empty
 * submission becomes NaN rather than silently coercing to 0, so a cleared
 * field can never save an unintended zero fee.
 */
const fee = (label: string) =>
  z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? Number.NaN
        : Number(value),
    z
      .number({ message: `${label} يجب أن يكون رقماً.` })
      .finite({ message: `${label} يجب أن يكون رقماً صالحاً.` })
      .min(0, `${label} لا يمكن أن يكون سالباً.`)
      .max(9_999_999_999.99, `${label} أكبر من الحد المسموح.`),
  );

export const commissionRateUpsertSchema = z.object({
  /** Firestore city id; null writes the global fallback row. */
  cityId: z.string().trim().min(1).nullable(),
  merchantActivationFee: fee("رسوم تفعيل التاجر"),
  photoItemFee: fee("رسم الصورة / الصنف"),
  contractingBaseFee: fee("الرسم الأساسي للتعاقد"),
});

export type CommissionRateUpsertInput = z.infer<
  typeof commissionRateUpsertSchema
>;
