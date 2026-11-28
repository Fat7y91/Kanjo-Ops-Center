import { z } from "zod";

/**
 * Discount-coupon domain types.
 *
 * Mirrors `app.coupons`. Money is handled in major units at the boundary and
 * converted once, at the service layer, so a form or CSV value can never reach
 * the database in the wrong unit.
 *
 * `percentage_discount` stores its rate in basis points inside
 * `discount_amount_minor` (15% = 1500). Every other type stores a fixed amount.
 * The CSV importer applies a single ×100 rule that is correct for both, because
 * percent→basis-points and currency→minor-units are both a factor of 100.
 */

export const COUPON_TYPES = [
  "free_shipping",
  "welcome_coupon",
  "cashback",
  "percentage_discount",
  "fixed_amount",
] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const COUPON_TYPE_LABEL: Record<CouponType, string> = {
  free_shipping: "توصيل مجاني",
  welcome_coupon: "كوبون ترحيبي",
  cashback: "استرداد نقدي",
  percentage_discount: "خصم نسبة",
  fixed_amount: "خصم مبلغ ثابت",
};

export const COUPON_FUNDINGS = ["platform", "vendor", "split"] as const;
export type CouponFunding = (typeof COUPON_FUNDINGS)[number];

export const COUPON_FUNDING_LABEL: Record<CouponFunding, string> = {
  platform: "على كانجو",
  vendor: "على التاجر",
  split: "مشترك",
};

export type Coupon = {
  id: string;
  code: string;
  couponType: CouponType;
  active: boolean;
  discountFundedBy: CouponFunding;
  vendorFundingPercent: number;
  stackable: boolean;
  stackPriority: number;
  /** Fixed amount, or the rate as a percentage for `percentage_discount`. */
  discountAmount: number;
  shippingDiscount: number;
  cashbackAmount: number;
  totalImpact: number;
  vendorFunded: number;
  platformFunded: number;
  budgetApplied: number;
  budgetCap: number | null;
  budgetUsed: number;
  budgetRemaining: number | null;
  /** Absolute per-order cap in major units; null means no cap. */
  maxDiscount: number | null;
  usesCount: number;
  lastUsedAt: string | null;
  createdAt: string;
};

/** Rule fields an operator sets by hand, shared by create and update. */
const ruleShape = {
  code: z
    .string()
    .trim()
    .min(1, "كود الكوبون مطلوب.")
    .max(64, "كود الكوبون طويل جداً.")
    .transform((value) => value.toUpperCase()),
  couponType: z.enum(COUPON_TYPES),
  active: z.boolean().default(true),
  discountFundedBy: z.enum(COUPON_FUNDINGS).default("platform"),
  vendorFundingPercent: z.coerce
    .number()
    .min(0, "نسبة تمويل التاجر لا تكون سالبة.")
    .max(100, "نسبة تمويل التاجر لا تتجاوز 100.")
    .default(0),
  stackable: z.boolean().default(false),
  stackPriority: z.coerce.number().int().min(0).default(0),
  discountAmount: z.coerce
    .number()
    .min(0, "قيمة الخصم لا تكون سالبة.")
    .default(0),
  shippingDiscount: z.coerce.number().min(0).default(0),
  cashbackAmount: z.coerce.number().min(0).default(0),
  budgetCap: z.coerce.number().min(0).nullable().default(null),
  /** Absolute discount cap per order; relevant to percentage coupons. */
  maxDiscount: z.coerce.number().min(0).nullable().default(null),
};

export const couponCreateSchema = z.object(ruleShape).refine(
  (value) =>
    value.couponType !== "free_shipping" ||
    value.discountFundedBy === "platform",
  {
    message: "كوبون التوصيل المجاني يُموَّل من كانجو فقط.",
    path: ["discountFundedBy"],
  },
);

export const couponUpdateSchema = z.object(ruleShape);

export type CouponCreateInput = z.infer<typeof couponCreateSchema>;
export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/** Percent rate (15) → basis points (1500), for `percentage_discount`. */
export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}
