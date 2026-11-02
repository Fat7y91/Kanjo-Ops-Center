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
  followUpAt: z
    .string({ invalid_type_error: "موعد المتابعة غير صالح." })
    .trim()
    .nullable()
    .optional(),
  followUpKind: z
    .enum(FOLLOW_UP_KINDS, {
      required_error: "اختر نوع المتابعة.",
      invalid_type_error: "نوع المتابعة غير صالح.",
    })
    .optional(),
  followUpNote: z
    .string({ invalid_type_error: "ملاحظة المتابعة غير صالحة." })
    .trim()
    .max(500, "ملاحظة المتابعة لا تتجاوز 500 حرف.")
    .optional(),
  /*
   * Dialable contact for a follow-up. Spaces, dashes and parentheses are
   * removed before the value reaches the store so the board can build `tel:`
   * and `wa.me` links without re-parsing.
   *
   * `null` is accepted deliberately: the visit engine clears the field by
   * sending `report.followUpContactNumber || null`, and a schema that only
   * allowed `undefined` answered that with "Expected string, received null"
   * — a raw Zod message leaking to the rep as a 422 instead of an inline
   * Arabic error. Emptiness is not the same as absence here: the mandatory
   * rule lives in `superRefine`, so a blank number stays a validation issue
   * about the field rather than a type failure.
   */
  followUpContactNumber: z
    .string({
      required_error: "رقم هاتف المتابعة مطلوب",
      invalid_type_error: "رقم هاتف المتابعة مطلوب",
    })
    .trim()
    .max(40, "رقم هاتف المتابعة طويل جداً.")
    .transform((value) => value.replace(/[\s\-()]/g, ""))
    .nullable()
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

    /*
     * A follow-up OR an agreement always carries a reachable number. This is
     * deliberately broader than the old call/WhatsApp-only condition — a
     * "visit" follow-up and a negotiated outcome both need someone to call,
     * and leaving the field optional made the recorded task unreachable in
     * practice.
     */
    const needsNumber =
      Boolean(value.followUpAt) || COMMISSION_OUTCOMES.includes(value.outcome);
    if (needsNumber) {
      const digits = (value.followUpContactNumber ?? "").replace(/\D/g, "");
      if (digits.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["followUpContactNumber"],
          message: "رقم هاتف المتابعة مطلوب عند تسجيل متابعة أو اتفاق.",
        });
      } else if (digits.length < 8) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["followUpContactNumber"],
          message: "رقم هاتف المتابعة يجب أن يحتوي 8 أرقام على الأقل.",
        });
      }
    }
  });

export const visitSyncSchema = z.object({
  visits: z.array(visitReportSchema).min(1).max(50),
});

export type VisitReportInput = z.infer<typeof visitReportSchema>;
export type VisitSyncInput = z.infer<typeof visitSyncSchema>;
