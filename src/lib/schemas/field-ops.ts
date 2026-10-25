import { z } from "zod";

import {
  CITY_STAGES,
  CONTRACT_STATES,
  FIELD_TEAMS,
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

export const merchantCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم التاجر مطلوب.").max(120),
  cityId: z.string().trim().min(1, "اختر المدينة."),
  category: z.string().trim().min(2, "تصنيف التاجر مطلوب.").max(80),
  targetCommission: z.coerce
    .number()
    .min(0, "العمولة لا يمكن أن تكون سالبة.")
    .max(100, "العمولة لا يمكن أن تتجاوز 100%."),
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
});

export const taskCreateSchema = taskAssignSchema;

export const visitReportSchema = z.object({
  outcome: z.enum(CONTRACT_STATES),
  notes: z
    .string()
    .trim()
    .min(10, "ملاحظات الزيارة يجب ألا تقل عن 10 أحرف.")
    .max(4000),
  taskId: z.string().trim().min(1).nullable().optional(),
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

export const merchantStateSchema = z.object({
  state: z.enum(CONTRACT_STATES),
  note: z
    .string()
    .trim()
    .min(5, "مطلوب ملاحظة تغيير الحالة لا تقل عن 5 أحرف.")
    .max(1000),
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
export type MerchantCreateInput = z.infer<typeof merchantCreateSchema>;
export type TaskAssignInput = z.infer<typeof taskAssignSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type VisitReportInput = z.infer<typeof visitReportSchema>;
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
