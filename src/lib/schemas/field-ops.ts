import { z } from "zod";

import {
  CITY_STAGES,
  COMMISSION_OUTCOMES,
  CONTRACT_STATES,
  FIELD_TEAMS,
  FOLLOW_UP_KINDS,
} from "@/lib/field-ops/types";

const zonePointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const competitorSchema = z.object({
  name: z.string().trim().min(2, "اسم المنافس مطلوب.").max(80),
  page: z.union([
    z.string().trim().url("أدخل رابط منافس صالحاً."),
    z.literal(""),
  ]),
  marketStrength: z.enum(["low", "medium", "high"]),
});

export const cityCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم المدينة مطلوب.").max(80),
  country: z.string().trim().min(2, "الدولة مطلوبة.").max(60),
  governorate: z.string().trim().min(2, "المحافظة مطلوبة.").max(60),
  population: z.coerce
    .number()
    .int("عدد السكان يجب أن يكون رقماً صحيحاً.")
    .min(1, "عدد السكان يجب أن يكون أكبر من صفر.")
    .max(100_000_000),
  stage: z.enum(CITY_STAGES),
  competitors: z.array(competitorSchema).max(10),
  strategicNotes: z.string().trim().max(2000),
  zone: z
    .array(zonePointSchema)
    .min(3, "ارسم ثلاث نقاط حدود على الأقل على الخريطة."),
});

export const cityManagerAssignSchema = z.object({
  userIds: z
    .array(z.string().trim().min(1))
    .min(1, "اختر مديراً واحداً على الأقل.")
    .max(25),
});

export const cityManagerRevokeSchema = z.object({
  userId: z.string().trim().min(1, "معرّف المدير مطلوب."),
});

export const merchantCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم التاجر مطلوب.").max(120),
  cityId: z.string().trim().min(1, "اختر المدينة."),
  vendorTypeId: z.coerce
    .number()
    .int("نوع التاجر يجب أن يكون معرّفاً رقمياً.")
    .positive("اختر نوع التاجر من التصنيف المركزي.")
    .max(9_999_999),
  targetCommission: z.coerce
    .number()
    .min(0, "العمولة لا يمكن أن تكون سالبة.")
    .max(100, "العمولة لا يمكن أن تتجاوز 100%.")
    .default(0),
  estimatedMonthlyValue: z.coerce
    .number()
    .min(0)
    .max(100_000_000)
    .default(0),
  strategicNotes: z.string().trim().max(2000).default(""),
});

export const taskAssignSchema = z.object({
  merchantId: z.string().trim().min(1, "اختر التاجر."),
  team: z.enum(FIELD_TEAMS),
  visitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ الزيارة يجب أن يكون بصيغة YYYY-MM-DD."),
  instructions: z.string().trim().max(2000).default(""),
});

export const taskCreateSchema = taskAssignSchema;

const geoCaptureSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).nullable().default(null),
  capturedAt: z.string().trim().min(1),
});

const visitContactSchema = z.object({
  name: z.string().trim().max(120).default(""),
  role: z.string().trim().max(120).default(""),
  mobile: z.string().trim().max(40).default(""),
});

/**
 * Weighted rep opinion. `trait` is either a known trait key or a custom
 * free-form label supplied by the rep; `weight` is a 0-100 intensity.
 */
const repOpinionSchema = z
  .object({
    trait: z.string().trim().min(1, "وسم الرأي مطلوب.").max(60),
    weight: z.coerce
      .number()
      .int("وزن الرأي يجب أن يكون رقماً صحيحاً.")
      .min(0, "الوزن لا يقل عن 0%.")
      .max(100, "الوزن لا يتجاوز 100%."),
    label: z.string().trim().max(60).optional(),
  })
  .refine((opinion) => opinion.weight > 0, {
    message: "اختر وزناً أكبر من صفر لأي رأي مسجَّل.",
  });

export const visitReportSchema = z
  .object({
    outcome: z.enum(CONTRACT_STATES),
    notes: z
      .string()
      .trim()
      .min(10, "ملاحظات الزيارة يجب ألا تقل عن 10 أحرف.")
      .max(4000),
    taskId: z.string().trim().min(1).nullable().optional(),
    startedAt: z.string().trim().min(1).nullable().optional(),
    endedAt: z.string().trim().min(1).nullable().optional(),
    durationSeconds: z.coerce
      .number()
      .int()
      .min(0)
      .max(86_400)
      .nullable()
      .optional(),
    startLocation: geoCaptureSchema.nullable().optional(),
    endLocation: geoCaptureSchema.nullable().optional(),
    contact: visitContactSchema.nullable().optional(),
    opinions: z.array(repOpinionSchema).max(12).default([]),
    agreedCommission: z.coerce
      .number()
      .min(1, "النسبة المتفق عليها يجب أن تكون بين 1% و100%.")
      .max(100, "النسبة المتفق عليها يجب أن تكون بين 1% و100%.")
      .nullable()
      .optional(),
    followUpAt: z.string().trim().min(1).nullable().optional(),
    followUpKind: z.enum(FOLLOW_UP_KINDS).optional(),
    followUpNote: z.string().trim().max(500).optional(),
    source: z.enum(["task", "unplanned", "offline"]).optional(),
    clientVisitId: z.string().trim().max(80).nullable().optional(),
  })
  .superRefine((value, context) => {
    // A negotiated outcome must always carry the number that was agreed on.
    if (
      COMMISSION_OUTCOMES.includes(value.outcome) &&
      (value.agreedCommission == null || value.agreedCommission <= 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agreedCommission"],
        message: "النسبة المتفق عليها مطلوبة عند الاتفاق المبدئي أو النهائي.",
      });
    }
  });

export const visitSyncSchema = z.object({
  visits: z.array(visitReportSchema).min(1).max(50),
});

export const transferRequestSchema = z.object({
  justification: z
    .string()
    .trim()
    .min(10, "مطلوب مبرر لا يقل عن 10 أحرف.")
    .max(1000),
});

export const editRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "مطلوب سبب تعديل لا يقل عن 10 أحرف.")
    .max(1000),
});

export const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).optional().default(""),
});

export const merchantStateSchema = z
  .object({
    state: z.enum(CONTRACT_STATES),
    note: z
      .string()
      .trim()
      .min(5, "مطلوب ملاحظة تغيير الحالة لا تقل عن 5 أحرف.")
      .max(1000),
    agreedCommission: z.coerce
      .number()
      .min(1, "النسبة النهائية يجب أن تكون بين 1% و100%.")
      .max(100, "النسبة النهائية يجب أن تكون بين 1% و100%.")
      .nullable()
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      value.state === "signed_contract" &&
      (value.agreedCommission == null || value.agreedCommission <= 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agreedCommission"],
        message: "النسبة النهائية المقفلة مطلوبة عند اعتماد توقيع العقد.",
      });
    }
  });

export const merchantDocumentSchema = z.object({
  name: z.string().trim().min(2, "اسم المستند مطلوب.").max(160),
  type: z.enum(["contract", "tax", "license", "other"]),
  url: z.union([
    z.string().trim().url("أدخل رابط مستند صالحاً."),
    z.literal(""),
  ]),
});

export type CityCreateInput = z.infer<typeof cityCreateSchema>;
export type CityManagerAssignInput = z.infer<typeof cityManagerAssignSchema>;
export type CityManagerRevokeInput = z.infer<typeof cityManagerRevokeSchema>;
export type MerchantCreateInput = z.infer<typeof merchantCreateSchema>;
export type TaskAssignInput = z.infer<typeof taskAssignSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type VisitReportInput = z.infer<typeof visitReportSchema>;
export type VisitSyncInput = z.infer<typeof visitSyncSchema>;
export type TransferRequestInput = z.infer<typeof transferRequestSchema>;
export type EditRequestInput = z.infer<typeof editRequestSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export type MerchantStateInput = z.infer<typeof merchantStateSchema>;
export type MerchantDocumentInput = z.infer<typeof merchantDocumentSchema>;

export function zodErrorMessage(error: z.ZodError): string {
  const first = error.errors[0];
  if (!first) return "فشل التحقق من البيانات.";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}
