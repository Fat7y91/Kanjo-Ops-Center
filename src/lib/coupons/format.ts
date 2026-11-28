import { currencyMoney, shortDate } from "@/lib/accounts/format";

import {
  COUPON_FUNDING_LABEL,
  COUPON_TYPE_LABEL,
  type Coupon,
  type CouponFunding,
  type CouponType,
} from "./types";

/**
 * Display helpers for the coupons surface. Rows arrive from PostgREST, so any
 * value the domain type does not expect must render as a neutral placeholder
 * rather than throw inside a client component.
 */

export function couponMoney(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return currencyMoney(amount, "EGP");
}

export function couponTypeLabel(value: unknown): string {
  return COUPON_TYPE_LABEL[value as CouponType] ?? "نوع غير معروف";
}

export function couponFundingLabel(value: unknown): string {
  return COUPON_FUNDING_LABEL[value as CouponFunding] ?? "—";
}

export function couponDate(value: unknown): string {
  return typeof value === "string" && value !== "" ? shortDate(value) : "—";
}

/**
 * The customer-facing value of a coupon, formatted for its type: a percentage
 * rate for `percentage_discount`, a shipping/discount/cashback amount
 * otherwise.
 */
export function couponValueLabel(coupon: Coupon): string {
  switch (coupon.couponType) {
    case "percentage_discount":
      return `${coupon.discountAmount}%`;
    case "free_shipping":
      return "توصيل مجاني";
    case "cashback":
      return couponMoney(coupon.cashbackAmount);
    default:
      return couponMoney(coupon.discountAmount);
  }
}
