import type { BiOrderMetricRow } from "./types";

/** Entity and window filters owned by the orders module. */
export type OrderMetricFilters = {
  merchantId: string | null;
  courierId: string | null;
  cityId: string | null;
  couponCode: string | null;
  /** Inclusive ISO day (`YYYY-MM-DD`) bounds. Empty means unbounded. */
  from: string;
  to: string;
};

export const EMPTY_ORDER_FILTERS: OrderMetricFilters = {
  merchantId: null,
  courierId: null,
  cityId: null,
  couponCode: null,
  from: "",
  to: "",
};

export type OrderMetricSummary = {
  orders: number;
  volume: number;
  /** Mean order value in the slice, 0 when there are no orders. */
  averageOrderValue: number;
  /** Frozen merchant commissions on the operations in scope. */
  merchantCommission: number;
  /**
   * Kanjo's delivery commission from drivers: the part of the delivery fee the
   * courier does not keep. A subsidised delivery never becomes a negative
   * collection.
   */
  driverCommission: number;
  /** Operational cash Kanjo earns before any overhead is deducted. */
  operationalCollection: number;
  platformProfit: number;
  merchantProfit: number;
  courierProfit: number;
  /** Discounts the platform itself funded: coupon share plus wallet credit. */
  platformDiscount: number;
  discounts: number;
};

export function filterOrderRows(
  rows: readonly BiOrderMetricRow[],
  filters: OrderMetricFilters,
): BiOrderMetricRow[] {
  return rows.filter(
    (row) =>
      (!filters.merchantId || row.merchantId === filters.merchantId) &&
      (!filters.courierId || row.courierId === filters.courierId) &&
      (!filters.cityId || row.cityId === filters.cityId) &&
      (!filters.couponCode || row.couponCode === filters.couponCode) &&
      (!filters.from || row.date >= filters.from) &&
      (!filters.to || row.date <= filters.to),
  );
}

/**
 * Profit is derived, never stored.
 *
 * `orderDiscount` is the generic order discount imported from the orders CSV.
 * Legacy coupon rows predate that column and store the same money in
 * `couponDiscount`, so the two are coalesced rather than summed: one order
 * discount is counted once. Shipping, reward and wallet discounts are separate
 * line items and are always added.
 *
 * The platform keeps the commission minus the discounts it funds: the generic
 * order discount (or the coupon platform share on native coupon rows), free
 * shipping, rewards and wallet credit. The merchant nets order value minus
 * commission and the discounts it funds itself. The courier earns the frozen
 * delivery cut. The displayed total is not deducted a second time.
 */
export function summarizeOrderMetrics(
  rows: readonly BiOrderMetricRow[],
): OrderMetricSummary {
  let orders = 0;
  let volume = 0;
  let deliveryFee = 0;
  let driverCommission = 0;
  let commission = 0;
  let courierCut = 0;
  let orderDiscount = 0;
  let platformOrderDiscount = 0;
  let shippingDiscount = 0;
  let rewardDiscount = 0;
  let vendorFunded = 0;
  let walletDiscount = 0;

  for (const row of rows) {
    const genericDiscount = row.orderDiscount ?? 0;
    const couponDiscount = row.couponDiscount ?? 0;
    const couponPlatformShare = row.platformFunded ?? 0;

    orders += row.orders;
    volume += row.volume;
    deliveryFee += row.deliveryFee;
    driverCommission += Math.max(0, row.deliveryFee - row.courierCut);
    commission += row.commission;
    courierCut += row.courierCut;

    /* One order discount, never both representations. */
    orderDiscount += genericDiscount > 0 ? genericDiscount : couponDiscount;
    platformOrderDiscount +=
      genericDiscount > 0
        ? genericDiscount
        : couponPlatformShare > 0
          ? couponPlatformShare
          : couponDiscount;

    shippingDiscount += row.shippingDiscount ?? 0;
    rewardDiscount += row.rewardDiscount ?? 0;
    vendorFunded += row.vendorFunded;
    walletDiscount += row.walletDiscount;
  }

  const platformDiscount =
    platformOrderDiscount + shippingDiscount + rewardDiscount;

  return {
    orders,
    volume,
    averageOrderValue: orders === 0 ? 0 : volume / orders,
    merchantCommission: commission,
    driverCommission,
    operationalCollection: commission + driverCommission,
    platformProfit: commission - platformDiscount - walletDiscount,
    merchantProfit: volume - commission - vendorFunded,
    courierProfit: courierCut,
    platformDiscount,
    discounts:
      orderDiscount + shippingDiscount + rewardDiscount + walletDiscount,
  };
}

export type OrderMetricOptions = {
  merchants: { id: string; name: string }[];
  couriers: { id: string; name: string }[];
  cities: string[];
  coupons: string[];
};

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function orderMetricOptions(
  rows: readonly BiOrderMetricRow[],
): OrderMetricOptions {
  return {
    merchants: uniqueBy(
      rows.map((row) => ({ id: row.merchantId, name: row.merchantName })),
      (item) => item.id,
    ).sort((left, right) => left.name.localeCompare(right.name)),
    couriers: uniqueBy(
      rows.map((row) => ({ id: row.courierId, name: row.courierName })),
      (item) => item.id,
    ).sort((left, right) => left.name.localeCompare(right.name)),
    cities: Array.from(
      new Set(rows.map((row) => row.cityId).filter((id): id is string => !!id)),
    ),
    coupons: Array.from(
      new Set(rows.map((row) => row.couponCode).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right)),
  };
}
