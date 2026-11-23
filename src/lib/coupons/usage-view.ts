import type {
  DeliveredCouponUsage,
} from "./delivered-usage";
import type { CouponFunding, CouponType } from "./types";
import type { CouponUsageReportRow } from "./usage-report";

export type CouponUsageMode = "report" | "delivered";

export type CouponUsageViewRow = {
  code: string;
  usesCount: number;
  discountAmount: number;
  shippingDiscount: number;
  cashbackAmount: number;
  totalImpact: number;
  platformFunded: number;
  vendorFunded: number;
  couponType?: CouponType;
  discountFundedBy?: CouponFunding;
  lastUsedAt?: string | null;
};

export type CouponUsageViewTotals = {
  uses: number;
  totalImpact: number;
  platformFunded: number;
  vendorFunded: number;
  discountAmount: number;
  shippingDiscount: number;
  cashbackAmount: number;
  activeCodes: number;
  totalCodes: number;
};

export type CouponUsageView = {
  rows: CouponUsageViewRow[];
  topCodes: CouponUsageViewRow[];
  totals: CouponUsageViewTotals;
  hasDeliveredCodes: boolean;
};

function byImpactThenUses(
  left: CouponUsageViewRow,
  right: CouponUsageViewRow,
): number {
  return right.totalImpact - left.totalImpact || right.usesCount - left.usesCount;
}

function totalsOf(rows: readonly CouponUsageViewRow[]): CouponUsageViewTotals {
  return rows.reduce<CouponUsageViewTotals>(
    (summary, row) => ({
      uses: summary.uses + row.usesCount,
      totalImpact: summary.totalImpact + row.totalImpact,
      platformFunded: summary.platformFunded + row.platformFunded,
      vendorFunded: summary.vendorFunded + row.vendorFunded,
      discountAmount: summary.discountAmount + row.discountAmount,
      shippingDiscount: summary.shippingDiscount + row.shippingDiscount,
      cashbackAmount: summary.cashbackAmount + row.cashbackAmount,
      activeCodes: summary.activeCodes + (row.usesCount > 0 ? 1 : 0),
      totalCodes: summary.totalCodes + 1,
    }),
    {
      uses: 0,
      totalImpact: 0,
      platformFunded: 0,
      vendorFunded: 0,
      discountAmount: 0,
      shippingDiscount: 0,
      cashbackAmount: 0,
      activeCodes: 0,
      totalCodes: 0,
    },
  );
}

/**
 * Selects the visible coupon table for the active comparison mode.
 *
 * Report mode is the imported marketing snapshot, including cancelled orders.
 * Delivered mode is the cash actual from the operation ledger and can be empty
 * when the order export has no `coupon_code` column yet.
 */
export function buildCouponUsageView(input: {
  mode: CouponUsageMode;
  reportRows: readonly CouponUsageReportRow[];
  delivered: DeliveredCouponUsage;
  showUnused: boolean;
}): CouponUsageView {
  const { mode, reportRows, delivered, showUnused } = input;

  if (mode === "delivered") {
    const rows: CouponUsageViewRow[] = delivered.groups.map((group) => ({
      code: group.code,
      usesCount: group.usesCount,
      discountAmount: group.discountAmount,
      shippingDiscount: group.shippingDiscount,
      cashbackAmount: group.rewardDiscount,
      totalImpact: group.totalImpact,
      platformFunded: 0,
      vendorFunded: 0,
    }));
    return {
      rows,
      topCodes: rows.filter((row) => row.totalImpact > 0).slice(0, 5),
      totals: {
        uses: delivered.groups.reduce((sum, group) => sum + group.usesCount, 0),
        totalImpact: delivered.totalImpact,
        platformFunded: 0,
        vendorFunded: 0,
        discountAmount: delivered.discountAmount,
        shippingDiscount: delivered.shippingDiscount,
        cashbackAmount: delivered.rewardDiscount,
        activeCodes: delivered.groups.length,
        totalCodes: delivered.groups.length,
      },
      hasDeliveredCodes: delivered.hasCouponCodes,
    };
  }

  const rows: CouponUsageViewRow[] = reportRows
    .filter((row) => showUnused || row.usesCount > 0)
    .map((row) => ({
      code: row.code,
      usesCount: row.usesCount,
      discountAmount: row.discountAmount,
      shippingDiscount: row.shippingDiscount,
      cashbackAmount: row.cashbackAmount,
      totalImpact: row.totalImpact,
      platformFunded: row.platformFunded,
      vendorFunded: row.vendorFunded,
      couponType: row.couponType,
      discountFundedBy: row.discountFundedBy,
      lastUsedAt: row.lastUsedAt,
    }))
    .sort(byImpactThenUses);

  return {
    rows,
    topCodes: rows.filter((row) => row.totalImpact > 0).slice(0, 5),
    totals: totalsOf(rows),
    hasDeliveredCodes: delivered.hasCouponCodes,
  };
}
