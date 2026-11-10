import {
  COUPON_FUNDINGS,
  COUPON_TYPES,
  type CouponFunding,
  type CouponType,
} from "./types";

/**
 * Pure parser for the approved coupon CSV export.
 *
 * The dashboard exports exactly these 20 columns:
 *
 *   coupon_code, coupon_type, active, discount_funded_by, vendor_funding_percent,
 *   stackable, stack_priority, uses_count, discount_amount, shipping_discount,
 *   cashback_amount, total_impact, vendor_funded_amount, platform_funded_amount,
 *   budget_applied_amount, budget_cap, budget_used, budget_remaining,
 *   last_used_at, created_at
 *
 * Money columns are currency units on input and become minor units here, once.
 * `budget_remaining` is carried by the export for reporting but is derived in
 * the database, so it is intentionally ignored. `total_impact`,
 * `vendor_funded_amount`, `platform_funded_amount`, `budget_applied_amount` and
 * `budget_used` are historical counters: imported for fidelity but never used
 * to price an order (the journal reads the rules, not the totals).
 *
 * Side-effect free so it runs on the client (preview) and the server (write) and
 * can be unit tested without Supabase.
 */

export type CouponCsvRow = {
  code: string;
  couponType: CouponType;
  active: boolean;
  discountFundedBy: CouponFunding;
  vendorFundingPercent: number;
  stackable: boolean;
  stackPriority: number;
  usesCount: number;
  discountAmountMinor: number;
  shippingDiscountMinor: number;
  cashbackAmountMinor: number;
  totalImpactMinor: number;
  vendorFundedMinor: number;
  platformFundedMinor: number;
  budgetAppliedMinor: number;
  budgetCapMinor: number | null;
  budgetUsedMinor: number;
  lastUsedAt: string | null;
  sourceCreatedAt: string | null;
};

export type CouponCsvIssue = {
  line: number;
  code: string;
  message: string;
};

export type ParsedCoupons = {
  rows: CouponCsvRow[];
  issues: CouponCsvIssue[];
  duplicates: number;
};

/** Result of a bulk import, shared by the server write and the client summary. */
export type CouponImportSummary = {
  parsed: number;
  written: number;
  duplicates: number;
  issues: CouponCsvIssue[];
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

/** Currency units on input → integer minor units. */
function toMinor(value: unknown): number {
  const numeric = toNumber(value);
  if (numeric === null) return 0;
  return Math.round(numeric * 100);
}

function toBool(value: unknown): boolean {
  const text = clean(value).toLowerCase();
  if (text === "") return false;
  return ["true", "1", "yes", "y", "نعم", "نشط", "active"].includes(text);
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

export function parseCouponRows(
  rows: Record<string, unknown>[],
): ParsedCoupons {
  const out: ParsedCoupons = { rows: [], issues: [], duplicates: 0 };
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 2; // +1 header, +1 to be 1-based
    const code = clean(row.coupon_code).toUpperCase();
    if (code === "") {
      out.issues.push({ line, code: "", message: "كود الكوبون مفقود." });
      return;
    }
    if (seen.has(code)) {
      out.duplicates += 1;
      return;
    }

    const couponType = toEnum<CouponType>(
      row.coupon_type,
      COUPON_TYPES,
      "fixed_amount",
    );

    /* Free shipping is platform-funded by law of the domain: the guard trigger
     * would reject anything else, so correct it here and keep the import clean
     * instead of failing the whole file on one bad row. */
    let discountFundedBy = toEnum<CouponFunding>(
      row.discount_funded_by,
      COUPON_FUNDINGS,
      "platform",
    );
    if (couponType === "free_shipping") discountFundedBy = "platform";

    const vendorFundingPercent = toNumber(row.vendor_funding_percent) ?? 0;
    const budgetCapRaw = clean(row.budget_cap);

    seen.add(code);
    out.rows.push({
      code,
      couponType,
      active: toBool(row.active),
      discountFundedBy,
      vendorFundingPercent: Math.min(100, Math.max(0, vendorFundingPercent)),
      stackable: toBool(row.stackable),
      stackPriority: Math.max(0, Math.trunc(toNumber(row.stack_priority) ?? 0)),
      usesCount: Math.max(0, Math.trunc(toNumber(row.uses_count) ?? 0)),
      discountAmountMinor: toMinor(row.discount_amount),
      shippingDiscountMinor: toMinor(row.shipping_discount),
      cashbackAmountMinor: toMinor(row.cashback_amount),
      totalImpactMinor: toMinor(row.total_impact),
      vendorFundedMinor: toMinor(row.vendor_funded_amount),
      platformFundedMinor: toMinor(row.platform_funded_amount),
      budgetAppliedMinor: toMinor(row.budget_applied_amount),
      budgetCapMinor: budgetCapRaw === "" ? null : toMinor(budgetCapRaw),
      budgetUsedMinor: toMinor(row.budget_used),
      lastUsedAt: toTimestamp(row.last_used_at),
      sourceCreatedAt: toTimestamp(row.created_at),
    });
  });

  return out;
}
