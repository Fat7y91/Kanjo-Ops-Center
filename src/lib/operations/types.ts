import { z } from "zod";

import type { CouponType } from "@/lib/coupons/types";

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

export const CLEARING_PARTY_TYPES = ["merchant", "courier"] as const;
export type ClearingPartyType = (typeof CLEARING_PARTY_TYPES)[number];

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
  /** Coupon code frozen onto the row, or empty when none was applied. */
  couponCode: string;
  /** Coupon discount actually granted at checkout (major units). */
  couponDiscount: number;
  couponShippingDiscount: number;
  couponCashback: number;
  couponPlatformFunded: number;
  couponVendorFunded: number;
  /** Manual wallet discount applied as cash (platform-funded). */
  walletDiscount: number;
  walletDiscountReason: string;
  walletDiscountRef: string;
  note: string;
  occurredAt: string;
  createdAt: string;
};

/** One coupon option offered to the blind-entry form. Type only, never money. */
export type CouponOption = {
  id: string;
  code: string;
  couponType: CouponType;
  active: boolean;
};

/**
 * The blind-entry view of an operation.
 *
 * This is the only operation shape the logging surface (page, API and client)
 * may carry. It deliberately omits commission, courier profit, balances and the
 * coupon funding split: an employee entering orders must not be able to read a
 * financial figure they did not type. Those fields stay in `OperationLog` for
 * the ledger, KPI and repository layers.
 */
export type OperationSummary = {
  id: string;
  orderId: string;
  merchantName: string;
  courierName: string;
  paymentMethod: PaymentMethod;
  currency: "EGP" | "SAR";
  orderValue: number;
  deliveryFee: number;
  couponCode: string;
  walletDiscount: number;
  note: string;
  occurredAt: string;
};

export function toOperationSummary(operation: OperationLog): OperationSummary {
  return {
    id: operation.id,
    orderId: operation.orderId,
    merchantName: operation.merchantName,
    courierName: operation.courierName,
    paymentMethod: operation.paymentMethod,
    currency: operation.currency,
    orderValue: operation.orderValue,
    deliveryFee: operation.deliveryFee,
    couponCode: operation.couponCode,
    walletDiscount: operation.walletDiscount,
    note: operation.note,
    occurredAt: operation.occurredAt,
  };
}

/**
 * One party ledger account in the clearinghouse.
 *
 * `balance` is the derived journal balance in major units. Positive means the
 * party owes Kanjo (a receivable); negative means Kanjo owes the party (a
 * payable). Settlement posts a balanced entry that zeroes it.
 */
export type ClearingAccountRow = {
  accountId: string;
  partyType: ClearingPartyType;
  partyId: string;
  partyName: string;
  currency: "EGP" | "SAR";
  balance: number;
};

/** One posted line in a party's statement of account. */
export type PartyStatementLine = {
  id: string;
  entryId: string;
  date: string;
  reference: string;
  memo: string;
  debit: number;
  credit: number;
  /** Running balance after this line, in major units (debit − credit). */
  running: number;
};

/**
 * A party's full statement of account.
 *
 * Lines are the party's own journal lines, oldest first, with a running
 * balance, so the closing figure equals the clearinghouse balance. `reference`
 * names the source (order id, settlement label) so a line is readable on its
 * own, which is what makes the statement printable.
 */
export type PartyStatement = {
  accountId: string;
  partyType: ClearingPartyType;
  partyId: string;
  partyName: string;
  currency: "EGP" | "SAR";
  balance: number;
  lines: PartyStatementLine[];
};

export type CourierOption = {
  id: string;
  displayName: string;
  active: boolean;
};

export type MerchantOption = {
  id: string;
  name: string;
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
  couponId: z
    .string()
    .uuid("اختر كوبوناً صحيحاً.")
    .nullish()
    .transform((value) => value ?? null),
  walletDiscount: z.coerce
    .number()
    .min(0, "خصم المحفظة لا يكون سالباً.")
    .default(0),
  walletDiscountReason: z
    .string()
    .trim()
    .max(200)
    .default(""),
  walletDiscountRef: z
    .string()
    .trim()
    .max(120)
    .default(""),
  note: optionalNote.default(""),
});

export type OperationLogInput = z.infer<typeof operationLogInputSchema>;

export const settleInputSchema = z
  .object({
    receiptNo: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((value) => (value ? value : null)),
    storagePath: z
      .string()
      .trim()
      .max(2048)
      .optional()
      .transform((value) => (value ? value : null)),
    mimeType: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => (value ? value : null)),
    sizeBytes: z.coerce.number().int().min(0).optional().nullable(),
  })
  .refine(
    (value) => (value.receiptNo ? Boolean(value.storagePath) : true),
    {
      message: "أرفق ملف الإيصال عند إدخال رقم الإيصال.",
      path: ["storagePath"],
    },
  );
