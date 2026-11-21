import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Per-order commission persistence.
 *
 * The database function is the transaction boundary: it rewrites the order's
 * frozen rate and the lines of its single journal entry together, so the
 * clearinghouse, merchant directory and statement can never disagree about the
 * new amount. No other order is touched.
 */

const WRITE_TIMEOUT_MS = 8_000;

export type CommissionEditResult = {
  id: string;
  orderId: string;
  commissionPercent: number;
  commission: number;
  merchantId: string;
};

type CommissionRow = {
  operation_id: string;
  order_id: string;
  commission_percent: number | string;
  commission_minor: number | string;
  merchant_id: string;
};

export async function repostOrderCommission(
  identifier: string,
  rate: number,
  actorId: string,
): Promise<CommissionEditResult> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .rpc("edit_operation_commission", {
      p_identifier: identifier,
      p_rate: rate,
      p_merchant_id: null,
      p_actor: actorId,
    })
    .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));

  if (error) throw error;

  const row = ((data ?? []) as CommissionRow[])[0];
  if (!row) {
    throw Object.assign(new Error("ORDER_NOT_FOUND: order does not exist"), {
      code: "P0002",
    });
  }

  return {
    id: row.operation_id,
    orderId: row.order_id,
    commissionPercent: Number(row.commission_percent),
    commission: Number(row.commission_minor) / 100,
    merchantId: row.merchant_id,
  };
}
