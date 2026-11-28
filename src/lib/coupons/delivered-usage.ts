/**
 * Delivered-order coupon actuals.
 *
 * The imported usage report counts every order a code touched, including
 * cancelled and undelivered ones. This module derives the cash actually given
 * up on delivered orders from `app.operation_logs`, which is the financial
 * source of truth and therefore always uses delivered rows only.
 */

export type DeliveredUsageSourceRow = {
  coupon_code: string | null;
  discount_minor: number | string | null;
  shipping_discount_minor: number | string | null;
  reward_discount_minor: number | string | null;
};

export type DeliveredCouponGroup = {
  code: string;
  usesCount: number;
  discountAmount: number;
  shippingDiscount: number;
  rewardDiscount: number;
  totalImpact: number;
};

export type DeliveredCouponUsage = {
  orders: number;
  discountAmount: number;
  shippingDiscount: number;
  rewardDiscount: number;
  totalImpact: number;
  hasCouponCodes: boolean;
  groups: DeliveredCouponGroup[];
};

export const EMPTY_DELIVERED_USAGE: DeliveredCouponUsage = {
  orders: 0,
  discountAmount: 0,
  shippingDiscount: 0,
  rewardDiscount: 0,
  totalImpact: 0,
  hasCouponCodes: false,
  groups: [],
};

function major(value: number | string | null): number {
  return Math.round(Number(value ?? 0)) / 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarizeDeliveredUsage(
  rows: readonly DeliveredUsageSourceRow[],
): DeliveredCouponUsage {
  let discountAmount = 0;
  let shippingDiscount = 0;
  let rewardDiscount = 0;
  const groups = new Map<string, DeliveredCouponGroup>();

  for (const row of rows) {
    const discount = major(row.discount_minor);
    const shipping = major(row.shipping_discount_minor);
    const reward = major(row.reward_discount_minor);
    discountAmount += discount;
    shippingDiscount += shipping;
    rewardDiscount += reward;

    const code = (row.coupon_code ?? "").trim().toUpperCase();
    if (!code) continue;
    const current = groups.get(code) ?? {
      code,
      usesCount: 0,
      discountAmount: 0,
      shippingDiscount: 0,
      rewardDiscount: 0,
      totalImpact: 0,
    };
    current.usesCount += 1;
    current.discountAmount += discount;
    current.shippingDiscount += shipping;
    current.rewardDiscount += reward;
    current.totalImpact = round2(
      current.discountAmount + current.shippingDiscount + current.rewardDiscount,
    );
    groups.set(code, current);
  }

  for (const [code, group] of groups) {
    groups.set(code, {
      ...group,
      discountAmount: round2(group.discountAmount),
      shippingDiscount: round2(group.shippingDiscount),
      rewardDiscount: round2(group.rewardDiscount),
      totalImpact: round2(group.totalImpact),
    });
  }

  const sorted = [...groups.values()].sort(
    (left, right) =>
      right.totalImpact - left.totalImpact || right.usesCount - left.usesCount,
  );
  const totalImpact = round2(discountAmount + shippingDiscount + rewardDiscount);

  return {
    orders: rows.length,
    discountAmount: round2(discountAmount),
    shippingDiscount: round2(shippingDiscount),
    rewardDiscount: round2(rewardDiscount),
    totalImpact,
    hasCouponCodes: sorted.length > 0,
    groups: sorted,
  };
}
