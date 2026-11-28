import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import {
  EMPTY_DELIVERED_USAGE,
  summarizeDeliveredUsage,
  type DeliveredCouponUsage,
  type DeliveredUsageSourceRow,
} from "./delivered-usage";

const ROW_LIMIT = 50_000;
const TIMEOUT_MS = 8_000;

/**
 * Reads the delivered rows that carry the order-level discount actuals.
 * `delivered_at` is the operation ledger's delivery marker; undelivered rows
 * have no business being in the cash comparison.
 */
export async function loadDeliveredCouponUsage(): Promise<DeliveredCouponUsage> {
  try {
    const client = getSupabaseServerClient();
    const { data, error } = await client
      .schema("app")
      .from("operation_logs")
      .select(
        "coupon_code,discount_minor,shipping_discount_minor,reward_discount_minor",
      )
      .not("delivered_at", "is", null)
      .limit(ROW_LIMIT)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

    if (error) {
      if (isMissingSchemaObject(error)) return EMPTY_DELIVERED_USAGE;
      return EMPTY_DELIVERED_USAGE;
    }
    return summarizeDeliveredUsage(
      (data ?? []) as unknown as DeliveredUsageSourceRow[],
    );
  } catch {
    return EMPTY_DELIVERED_USAGE;
  }
}
