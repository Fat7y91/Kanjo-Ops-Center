import { z } from "zod";

import { DEFAULT_HANDOVER_OFFICER } from "./defaults";
import { CUSTODY_ITEM_KEYS } from "./types";

const custodyItemSchema = z.object({
  key: z.enum(CUSTODY_ITEM_KEYS),
  codePrefix: z.string().trim().max(8).nullish(),
  quantity: z.coerce.number().int().min(0).max(99),
  condition: z.string().trim().max(40).default("جديد"),
  unitPrice: z.coerce.number().min(0).max(1_000_000),
  label: z.string().trim().max(80).optional(),
  serial: z.string().trim().max(40).nullish(),
});

export const issueCustodySchema = z
  .object({
    riderMode: z.enum(["new", "existing"]).default("new"),
    riderId: z.string().uuid().nullish(),
    governorate: z.string().trim().min(1, "المحافظة مطلوبة."),
    city: z.string().trim().min(1, "المدينة مطلوبة."),
    sequence: z.coerce.number().int().min(1).max(9999).nullish(),
    receiptSequence: z.coerce.number().int().min(1).max(9999).nullish(),
    fullName: z.string().trim().max(80).default(""),
    nationalId: z.string().trim().default(""),
    phone: z.string().trim().default(""),
    workArea: z.string().trim().max(80).default(""),
    deliveryDate: z
      .string()
      .trim()
      .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "تاريخ التسليم غير صالح."),
    handoverOfficer: z
      .string()
      .trim()
      .min(2, "اسم مسؤول التسليم مطلوب.")
      .max(80)
      .default(DEFAULT_HANDOVER_OFFICER),
    items: z.array(custodyItemSchema).min(1).max(20),
    cashCustody: z.coerce.number().min(0).max(1_000_000).default(2000),
    totalAmount: z.coerce.number().min(0).max(10_000_000).optional(),
    notes: z.string().trim().max(500).default(""),
  })
  .superRefine((value, context) => {
    const keys = value.items.map((item) => item.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "لا يمكن تكرار بند العهدة نفسه.",
      });
    }
    const hasValue = value.items.some((item) => item.quantity > 0);
    if (!hasValue && value.cashCustody <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "أضف بنداً واحداً على الأقل أو عهدة نقدية.",
      });
    }
    if (value.riderMode === "existing") {
      if (!value.riderId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["riderId"],
          message: "اختر مندوباً مسجلاً.",
        });
      }
      if (value.nationalId && !/^[0-9]{14}$/.test(value.nationalId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nationalId"],
          message: "الرقم القومي يجب أن يكون 14 رقماً.",
        });
      }
      if (
        value.phone &&
        !/^\+?[0-9][0-9\s-]{6,18}$/.test(value.phone)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phone"],
          message: "أدخل رقم هاتف صالحاً، مثل 01012345678.",
        });
      }
      return;
    }
    if (!value.sequence) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sequence"],
        message: "رقم تسلسل المندوب مطلوب.",
      });
    }
    if (value.fullName.length < 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fullName"],
        message: "اسم المندوب مطلوب.",
      });
    }
    if (!/^[0-9]{14}$/.test(value.nationalId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nationalId"],
        message: "الرقم القومي يجب أن يكون 14 رقماً.",
      });
    }
    if (!/^\+?[0-9][0-9\s-]{6,18}$/.test(value.phone)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "أدخل رقم هاتف صالحاً، مثل 01012345678.",
      });
    }
  });

export const riderLookupSchema = z.object({
  nationalId: z
    .string()
    .trim()
    .regex(/^[0-9]{14}$/, "الرقم القومي يجب أن يكون 14 رقماً."),
});

export const sequenceQuerySchema = z.object({
  governorate: z.string().trim().min(1),
  city: z.string().trim().min(1),
});

export type IssueCustodyInput = z.infer<typeof issueCustodySchema>;
export type CustodyItemInput = z.infer<typeof custodyItemSchema>;
