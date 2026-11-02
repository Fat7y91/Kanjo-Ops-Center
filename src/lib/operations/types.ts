import { z } from "zod";

/**
 * Operations logger and clearinghouse domain types.
 *
 * Mirrors `20261102000003_operations_clearinghouse.sql`. Money crosses the
 * boundary in major units and is converted once, at the service layer, so a
 * form value can never reach the database in the wrong unit.
 */

export const PAYMENT_METHODS = ["COD", "ONLINE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  COD: "تحصيل عند التسليم",
  ONLINE: "دفع إلكتروني",
};

export const ENTITY_TYPES = ["merchant", "courier"] as const;
export type ClearingEntityType = (typeof ENTITY_TYPES)[number];

export const CLEARING_STATUSES = ["pending", "cleared"] as const;
export type ClearingStatus = (typeof CLEARING_STATUSES)[number];

export const CLEARING_STATUS_LABEL: Record<ClearingStatus, string> = {
  pending: "قيد التسوية",
  cleared: "مُسوّى",
};

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export type OperationLog = {
  id: string;
  orderId: string;
  merchantId: string;
  merchantName: string;
  courierId: string;
  courierName: string;
  paymentMethod: PaymentMethod;
  currency: "EGP" | "SAR";
  orderValue: number;
  deliveryFee: number;
  commissionPercent: number;
  commission: number;
  courierCutPercent: number;
  courierCut: number;
  note: string;
  occurredAt: string;
  createdAt: string;
};

export type ClearingLedgerRow = {
  id: string;
  operationId: string;
  orderId: string;
  entityType: ClearingEntityType;
  partyId: string;
  partyName: string;
  amount: number;
  currency: "EGP" | "SAR";
  status: ClearingStatus;
  receiptUrl: string | null;
  clearedAt: string | null;
  createdAt: string;
};

/** A party's open book: positive `balance` is owed to them, negative by them. */
export type ClearingParty = {
  entityType: ClearingEntityType;
  partyId: string;
  partyName: string;
  currency: "EGP" | "SAR";
  balance: number;
  pendingCount: number;
};

export type CourierOption = {
  id: string;
  displayName: string;
  cutPercent: number;
  active: boolean;
};

export type MerchantOption = {
  id: string;
  name: string;
  commissionPercent: number;
};

const optionalNote = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value ?? "");

export const operationLogInputSchema = z.object({
  orderId: z.string().trim().min(1, "رقم الطلب مطلوب.").max(80),
  merchantId: z.string().trim().min(1, "اختر التاجر."),
  courierId: z.string().uuid("اختر المندوب."),
  paymentMethod: z.enum(PAYMENT_METHODS),
  currency: z.enum(["EGP", "SAR"]).default("EGP"),
  orderValue: z.coerce.number().positive("قيمة الطلب يجب أن تكون أكبر من صفر."),
  deliveryFee: z.coerce.number().min(0, "رسوم التوصيل لا تكون سالبة.").default(0),
  courierCut: z.coerce.number().min(0, "حصة المندوب لا تكون سالبة.").default(0),
  note: optionalNote.default(""),
});

export type OperationLogInput = z.infer<typeof operationLogInputSchema>;

export const settleInputSchema = z.object({
  receiptUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (value) => value === "" || /^https:\/\//i.test(value),
      "يجب أن يبدأ رابط الإيصال بـ https://.",
    )
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
});
