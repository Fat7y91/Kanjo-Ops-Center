import {
  COUPON_FUNDINGS,
  COUPON_TYPES,
  type CouponFunding,
  type CouponType,
} from "./types";

/**
 * Pure parser for `coupon-usage-report-*.csv`.
 *
 * The report has one row per applied code and includes every order the code
 * touched, including cancelled and undelivered orders. That is deliberately
 * different from the delivered-order financial journal, so the two totals can
 * disagree without either one being wrong.
 *
 * Money stays in currency units (EGP) from CSV to API to UI; the repository
 * performs the single conversion to database minor units. Converting here as
 * well made every amount render 100x too high. Rows with `uses_count = 0` are
 * kept: the dashboard hides them by default but the operator can switch them on
 * to see the full 308-code snapshot.
 */

export const COUPON_USAGE_REPORT_COLUMNS = [
  "coupon_code",
  "coupon_type",
  "discount_funded_by",
  "uses_count",
  "discount_amount",
  "shipping_discount",
  "cashback_amount",
  "total_impact",
  "platform_funded_amount",
  "vendor_funded_amount",
  "last_used_at",
] as const;

export type CouponUsageReportRow = {
  code: string;
  couponType: CouponType;
  discountFundedBy: CouponFunding;
  usesCount: number;
  discountAmount: number;
  shippingDiscount: number;
  cashbackAmount: number;
  totalImpact: number;
  platformFunded: number;
  vendorFunded: number;
  lastUsedAt: string | null;
  importedAt: string;
};

export type CouponUsageReportIssue = {
  line: number;
  code: string;
  message: string;
};

export type CouponUsageReportParseResult = {
  rows: Omit<CouponUsageReportRow, "importedAt">[];
  issues: CouponUsageReportIssue[];
  duplicates: number;
};

export type CouponUsageReportImportSummary = {
  parsed: number;
  written: number;
  duplicates: number;
  issues: CouponUsageReportIssue[];
};

function clean(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toNumber(value: unknown): number | null {
  const text = clean(value).replace(/,/g, "");
  if (text === "") return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function toMoney(value: unknown): number {
  const numeric = toNumber(value);
  return numeric === null ? 0 : Math.round(numeric * 100) / 100;
}

function toEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const text = clean(value).toLowerCase();
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback;
}

function toTimestamp(value: unknown): string | null {
  const text = clean(value);
  if (text === "") return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseCouponUsageReportRows(
  rows: Record<string, unknown>[],
): CouponUsageReportParseResult {
  const parsed: CouponUsageReportParseResult = {
    rows: [],
    issues: [],
    duplicates: 0,
  };
  const byCode = new Map<string, Omit<CouponUsageReportRow, "importedAt">>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const code = clean(row.coupon_code).toUpperCase();
    if (code === "") {
      parsed.issues.push({
        line,
        code: "",
        message: "كود الكوبون مفقود.",
      });
      return;
    }

    if (byCode.has(code)) parsed.duplicates += 1;

    const discountAmount = toMoney(row.discount_amount);
    const shippingDiscount = toMoney(row.shipping_discount);
    const cashbackAmount = toMoney(row.cashback_amount);
    const totalImpactRaw = clean(row.total_impact);
    const totalImpact =
      totalImpactRaw === ""
        ? Math.round((discountAmount + shippingDiscount + cashbackAmount) * 100) / 100
        : toMoney(row.total_impact);

    byCode.set(code, {
      code,
      couponType: toEnum<CouponType>(
        row.coupon_type,
        COUPON_TYPES,
        "fixed_amount",
      ),
      discountFundedBy: toEnum<CouponFunding>(
        row.discount_funded_by,
        COUPON_FUNDINGS,
        "platform",
      ),
      usesCount: Math.max(0, Math.trunc(toNumber(row.uses_count) ?? 0)),
      discountAmount,
      shippingDiscount,
      cashbackAmount,
      totalImpact,
      platformFunded: toMoney(row.platform_funded_amount),
      vendorFunded: toMoney(row.vendor_funded_amount),
      lastUsedAt: toTimestamp(row.last_used_at),
    });
  });

  parsed.rows = [...byCode.values()];
  return parsed;
}
