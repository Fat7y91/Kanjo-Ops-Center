import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { CouponsError } from "./errors";
import type { CouponUsageReportRow } from "./usage-report";

/** Tier 4 repository for the imported coupon usage snapshot. */

const COLUMNS =
  "code,coupon_type,discount_funded_by,uses_count,discount_amount_minor,shipping_discount_minor,cashback_amount_minor,total_impact_minor,platform_funded_minor,vendor_funded_minor,last_used_at,imported_at";

type UsageReportDbRow = {
  code: string;
  coupon_type: string;
  discount_funded_by: string;
  uses_count: number;
  discount_amount_minor: number | string;
  shipping_discount_minor: number | string;
  cashback_amount_minor: number | string;
  total_impact_minor: number | string;
  platform_funded_minor: number | string;
  vendor_funded_minor: number | string;
  last_used_at: string | null;
  imported_at: string;
};

function toReport(row: UsageReportDbRow): CouponUsageReportRow {
  const toMajor = (minor: number | string | null) => Number(minor ?? 0) / 100;
  return {
    code: row.code,
    couponType: row.coupon_type as CouponUsageReportRow["couponType"],
    discountFundedBy:
      row.discount_funded_by as CouponUsageReportRow["discountFundedBy"],
    usesCount: Number(row.uses_count),
    discountAmount: toMajor(row.discount_amount_minor),
    shippingDiscount: toMajor(row.shipping_discount_minor),
    cashbackAmount: toMajor(row.cashback_amount_minor),
    totalImpact: toMajor(row.total_impact_minor),
    platformFunded: toMajor(row.platform_funded_minor),
    vendorFunded: toMajor(row.vendor_funded_minor),
    lastUsedAt: row.last_used_at,
    importedAt: row.imported_at,
  };
}

export async function listCouponUsageReportRows(): Promise<
  CouponUsageReportRow[]
> {
  if (!hasSupabaseConfig()) return [];
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("coupon_usage_reports")
    .select(COLUMNS)
    .order("total_impact_minor", { ascending: false })
    .limit(5000);

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw new CouponsError(
      "USAGE_REPORT_UNAVAILABLE",
      "تعذر تحميل تقرير الكوبونات.",
      500,
    );
  }

  return ((data ?? []) as unknown as UsageReportDbRow[]).map(toReport);
}

export async function replaceCouponUsageReportRows(
  rows: Omit<CouponUsageReportRow, "importedAt">[],
  sourceFile: string | null,
): Promise<number> {
  if (!hasSupabaseConfig()) {
    throw new CouponsError(
      "COUPONS_UNAVAILABLE",
      "قاعدة بيانات الكوبونات غير متصلة.",
      503,
    );
  }
  if (rows.length === 0) return 0;

  const importedAt = new Date().toISOString();
  const payload = rows.map((row) => ({
    code: row.code,
    coupon_type: row.couponType,
    discount_funded_by: row.discountFundedBy,
    uses_count: row.usesCount,
    discount_amount_minor: Math.round(row.discountAmount * 100),
    shipping_discount_minor: Math.round(row.shippingDiscount * 100),
    cashback_amount_minor: Math.round(row.cashbackAmount * 100),
    total_impact_minor: Math.round(row.totalImpact * 100),
    platform_funded_minor: Math.round(row.platformFunded * 100),
    vendor_funded_minor: Math.round(row.vendorFunded * 100),
    last_used_at: row.lastUsedAt,
    source_file: sourceFile,
    imported_at: importedAt,
  }));

  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from("coupon_usage_reports")
    .upsert(payload, { onConflict: "code" });

  if (error) {
    throw new CouponsError(
      "USAGE_REPORT_IMPORT_FAILED",
      "تعذر حفظ تقرير الكوبونات.",
      500,
    );
  }
  return payload.length;
}
