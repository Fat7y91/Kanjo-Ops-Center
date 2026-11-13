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
  platformProfit: number;
  merchantProfit: number;
  courierProfit: number;
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
 * Platform keeps the commission minus the discounts it funds (coupon platform
 * share and wallet credit). The merchant nets order value minus commission and
 * the discounts it funds itself. The courier earns the frozen delivery cut.
 * Discounts are reported as a total for visibility, not subtracted twice.
 */
export function summarizeOrderMetrics(
  rows: readonly BiOrderMetricRow[],
): OrderMetricSummary {
  let orders = 0;
  let volume = 0;
  let commission = 0;
  let courierCut = 0;
  let platformFunded = 0;
  let vendorFunded = 0;
  let couponDiscount = 0;
  let walletDiscount = 0;

  for (const row of rows) {
    orders += row.orders;
    volume += row.volume;
    commission += row.commission;
    courierCut += row.courierCut;
    platformFunded += row.platformFunded;
    vendorFunded += row.vendorFunded;
    couponDiscount += row.couponDiscount;
    walletDiscount += row.walletDiscount;
  }

  return {
    orders,
    volume,
    platformProfit: commission - platformFunded - walletDiscount,
    merchantProfit: volume - commission - vendorFunded,
    courierProfit: courierCut,
    discounts: couponDiscount + walletDiscount,
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
