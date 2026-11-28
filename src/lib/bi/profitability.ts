import { z } from "zod";

import {
  COURIER_TIER1_LIMIT,
  COURIER_TIER1_RATE_MINOR,
  COURIER_TIER2_RATE_MINOR,
} from "@/lib/couriers/tiered-pay";

/**
 * Order P&L waterfall.
 *
 * Every figure is derived from delivered orders plus the posted attendance
 * entries. The arithmetic runs in minor units so the identities hold exactly:
 *
 *   commissions + delivery margin = gross order revenue
 *   gross order revenue - coupons = profit before the courier base
 *   profit before the courier base - courier daily base = net operating result
 *
 * The per-order courier fee is the tiered rate (7 EGP for the first 15 orders a
 * partner delivers in a Cairo day, 15 EGP above that). The 165 EGP attendance
 * base is the separate footer deduction, never folded into the per-order fee.
 *
 * The attendance base includes every posted `courier_attendance` entry in the
 * selected range, even courier-days with no delivered orders, so the footer
 * reconciles exactly with the `5100` journal balance.
 */

export type ProfitOrderFact = {
  /** Operating day, `YYYY-MM-DD`, as posted on the operation. */
  deliveryDate: string;
  cityId: string | null;
  courierId: string;
  /** Internal partner: orders count, but the courier payable can be excluded. */
  isInternalStaff?: boolean;
  /** Frozen commission posted on the order. */
  commissionMinor: number;
  deliveryFeeMinor: number;
  shippingDiscountMinor: number;
  /** Coupon / discount funded by the platform on this order. */
  discountMinor: number;
  rewardDiscountMinor: number;
};

export type AttendanceBaseFact = {
  courierId: string;
  /** Operating day, `YYYY-MM-DD`. */
  day: string;
  amountMinor: number;
  /** Internal partner: the 165 EGP base can be excluded. */
  isInternalStaff?: boolean;
};

export type ProfitabilityOptions = {
  /**
   * Drops the courier payable (tiered per-order fee + 165 base) for internal
   * partners. Orders, delivery fees, customer coupons and every merchant
   * commission stay in the result untouched.
   */
  excludeInternalStaff?: boolean;
};

export type ProfitabilityMeta = {
  from: string | null;
  to: string | null;
  cityId: string | null;
  cities: { id: string; name: string }[];
};

export type ProfitabilityMinor = {
  orders: number;
  commissions: number;
  deliveryMargin: number;
  grossRevenue: number;
  coupons: number;
  orderProfitBeforeBase: number;
  courierDailyBase: number;
  netOperating: number;
};

export type ProfitabilitySummary = {
  orders: number;
  currency: "EGP";
  from: string | null;
  to: string | null;
  cityId: string | null;
  cities: { id: string; name: string }[];
  /** (1) Frozen merchant commissions in scope. */
  commissions: number;
  /** (2) Delivery fee minus shipping discount minus the tiered courier fee. */
  deliveryMargin: number;
  /** (3) Commissions + delivery margin. */
  grossRevenue: number;
  /** (4) Coupon and reward discounts. */
  coupons: number;
  /** (5) Gross order revenue - coupons. */
  orderProfitBeforeBase: number;
  /** Per-order average of row 5, rounded to the piastre. */
  averagePerOrder: number;
  /** Posted 165 EGP attendance entries in scope, including 0-order manual days. */
  courierDailyBase: number;
  /** Row 5 - courier daily base. */
  netOperating: number;
};

function courierDayKey(courierId: string, day: string): string {
  return `${courierId}|${day}`;
}

/** Total tiered courier fee for a `courier/day` bucket of `orders` deliveries. */
export function tieredOrderFeeMinor(orders: number): number {
  const tier1 = Math.min(orders, COURIER_TIER1_LIMIT);
  const tier2 = Math.max(orders - COURIER_TIER1_LIMIT, 0);
  return tier1 * COURIER_TIER1_RATE_MINOR + tier2 * COURIER_TIER2_RATE_MINOR;
}

export function computeProfitabilityMinor(
  facts: readonly ProfitOrderFact[],
  bases: readonly AttendanceBaseFact[],
  options: ProfitabilityOptions = {},
): ProfitabilityMinor {
  const excludeInternal = options.excludeInternalStaff === true;
  let orders = 0;
  let commissions = 0;
  let deliveryFees = 0;
  let shippingDiscounts = 0;
  let coupons = 0;
  const perCourierDay = new Map<string, number>();

  for (const fact of facts) {
    orders += 1;
    commissions += fact.commissionMinor;
    deliveryFees += fact.deliveryFeeMinor;
    shippingDiscounts += fact.shippingDiscountMinor;
    coupons += fact.discountMinor + fact.rewardDiscountMinor;

    /* Internal orders still carry GMV, customer coupons, delivery fees and
     * merchant commission; only their courier fee is out of scope. */
    if (excludeInternal && fact.isInternalStaff) continue;
    const key = courierDayKey(fact.courierId, fact.deliveryDate);
    perCourierDay.set(key, (perCourierDay.get(key) ?? 0) + 1);
  }

  let courierOrderFee = 0;
  for (const count of perCourierDay.values()) {
    courierOrderFee += tieredOrderFeeMinor(count);
  }

  const deliveryMargin = deliveryFees - shippingDiscounts - courierOrderFee;
  const grossRevenue = commissions + deliveryMargin;
  const orderProfitBeforeBase = grossRevenue - coupons;

  let courierDailyBase = 0;
  for (const base of bases) {
    if (excludeInternal && base.isInternalStaff) continue;
    courierDailyBase += base.amountMinor;
  }

  return {
    orders,
    commissions,
    deliveryMargin,
    grossRevenue,
    coupons,
    orderProfitBeforeBase,
    courierDailyBase,
    netOperating: orderProfitBeforeBase - courierDailyBase,
  };
}

function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

export function emptyProfitability(
  meta: ProfitabilityMeta,
): ProfitabilitySummary {
  return summarizeProfitability(
    {
      orders: 0,
      commissions: 0,
      deliveryMargin: 0,
      grossRevenue: 0,
      coupons: 0,
      orderProfitBeforeBase: 0,
      courierDailyBase: 0,
      netOperating: 0,
    },
    meta,
  );
}

export function summarizeProfitability(
  minor: ProfitabilityMinor,
  meta: ProfitabilityMeta,
): ProfitabilitySummary {
  return {
    orders: minor.orders,
    currency: "EGP",
    from: meta.from,
    to: meta.to,
    cityId: meta.cityId,
    cities: meta.cities,
    commissions: toMajor(minor.commissions),
    deliveryMargin: toMajor(minor.deliveryMargin),
    grossRevenue: toMajor(minor.grossRevenue),
    coupons: toMajor(minor.coupons),
    orderProfitBeforeBase: toMajor(minor.orderProfitBeforeBase),
    averagePerOrder:
      minor.orders === 0
        ? 0
        : Math.round(minor.orderProfitBeforeBase / minor.orders) / 100,
    courierDailyBase: toMajor(minor.courierDailyBase),
    netOperating: toMajor(minor.netOperating),
  };
}

export function computeProfitability(
  facts: readonly ProfitOrderFact[],
  bases: readonly AttendanceBaseFact[],
  meta: ProfitabilityMeta,
  options: ProfitabilityOptions = {},
): ProfitabilitySummary {
  return summarizeProfitability(
    computeProfitabilityMinor(facts, bases, options),
    meta,
  );
}

const cityOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/** Wire format for `/api/bi/profitability`. */
export const profitabilitySummarySchema = z.object({
  orders: z.number().int().nonnegative(),
  currency: z.literal("EGP"),
  from: z.string().nullable(),
  to: z.string().nullable(),
  cityId: z.string().nullable(),
  cities: z.array(cityOptionSchema),
  commissions: z.number(),
  deliveryMargin: z.number(),
  grossRevenue: z.number(),
  coupons: z.number(),
  orderProfitBeforeBase: z.number(),
  averagePerOrder: z.number(),
  courierDailyBase: z.number(),
  netOperating: z.number(),
});
