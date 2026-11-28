import {
  COUPON_FUNDINGS,
  COUPON_FUNDING_LABEL,
  COUPON_TYPES,
  COUPON_TYPE_LABEL,
  type Coupon,
  type CouponFunding,
  type CouponType,
} from "@/lib/coupons/types";

/** Editable rule fields, held as strings so a partially typed value is valid. */
export type CouponFormState = {
  code: string;
  couponType: CouponType;
  active: boolean;
  discountFundedBy: CouponFunding;
  vendorFundingPercent: string;
  stackable: boolean;
  stackPriority: string;
  discountAmount: string;
  shippingDiscount: string;
  cashbackAmount: string;
  budgetCap: string;
  maxDiscount: string;
};

export const EMPTY_COUPON_FORM: CouponFormState = {
  code: "",
  couponType: "fixed_amount",
  active: true,
  discountFundedBy: "platform",
  vendorFundingPercent: "0",
  stackable: false,
  stackPriority: "0",
  discountAmount: "0",
  shippingDiscount: "0",
  cashbackAmount: "0",
  budgetCap: "",
  maxDiscount: "",
};

export function couponFormFrom(coupon: Coupon | null): CouponFormState {
  if (!coupon) return EMPTY_COUPON_FORM;
  return {
    code: coupon.code,
    couponType: coupon.couponType,
    active: coupon.active,
    discountFundedBy: coupon.discountFundedBy,
    vendorFundingPercent: String(coupon.vendorFundingPercent),
    stackable: coupon.stackable,
    stackPriority: String(coupon.stackPriority),
    discountAmount: String(coupon.discountAmount),
    shippingDiscount: String(coupon.shippingDiscount),
    cashbackAmount: String(coupon.cashbackAmount),
    budgetCap: coupon.budgetCap === null ? "" : String(coupon.budgetCap),
    maxDiscount: coupon.maxDiscount === null ? "" : String(coupon.maxDiscount),
  };
}

export const COUPON_TYPE_OPTIONS = COUPON_TYPES.map((type) => ({
  value: type,
  label: COUPON_TYPE_LABEL[type],
}));

export const COUPON_FUNDING_OPTIONS = COUPON_FUNDINGS.map((funding) => ({
  value: funding,
  label: COUPON_FUNDING_LABEL[funding],
}));

/** Major-unit form payload → the shape the create/update API expects. */
export function couponPayloadFrom(form: CouponFormState) {
  const isFreeShipping = form.couponType === "free_shipping";
  return {
    code: form.code.trim(),
    couponType: form.couponType,
    active: form.active,
    /* Free shipping is platform-funded by domain rule; never send otherwise. */
    discountFundedBy: isFreeShipping ? ("platform" as const) : form.discountFundedBy,
    vendorFundingPercent: Number(form.vendorFundingPercent) || 0,
    stackable: form.stackable,
    stackPriority: Number(form.stackPriority) || 0,
    discountAmount: Number(form.discountAmount) || 0,
    shippingDiscount: Number(form.shippingDiscount) || 0,
    cashbackAmount: Number(form.cashbackAmount) || 0,
    budgetCap: form.budgetCap.trim() === "" ? null : Number(form.budgetCap),
    maxDiscount:
      form.maxDiscount.trim() === "" ? null : Number(form.maxDiscount),
  };
}
