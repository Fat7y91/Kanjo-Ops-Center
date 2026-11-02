import { z } from "zod";

import {
  COMMISSION_OUTCOMES,
  CONTRACT_STATES,
  FOLLOW_UP_KINDS,
} from "@/lib/field-ops/types";

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

export const visitReportSchema = z.object({
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
  followUpContactNumber: z
    .string()
    .trim()
    .max(40)
    .transform((value) => value.replace(/[\s\-()]/g, ""))
    .optional(),
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

    // A scheduled communication follow-up is only actionable with a dialable
    // number. No follow-up date means no task is created, so no number needed.
    const kind = value.followUpKind;
    const needsNumber =
      Boolean(value.followUpAt) && (kind === "call" || kind === "whatsapp");
    if (needsNumber) {
      const digits = (value.followUpContactNumber ?? "").replace(/\D/g, "");
      if (digits.length < 8) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["followUpContactNumber"],
          message:
            "رقم هاتف المتابعة مطلوب عند اختيار المكالمة أو الواتساب.",
        });
      }
    }
  });

export const visitSyncSchema = z.object({
  visits: z.array(visitReportSchema).min(1).max(50),
});

export type VisitReportInput = z.infer<typeof visitReportSchema>;
export type VisitSyncInput = z.infer<typeof visitSyncSchema>;
