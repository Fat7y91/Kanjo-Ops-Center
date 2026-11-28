import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { isContractsDatabaseConfigured } from "./repository";
import type { Contract } from "./types";

/**
 * Order history attached to a contract's merchant.
 *
 * A merchant's orders are the durable evidence that the deal was already
 * operated. They gate a permanent delete: the register may not remove paperwork
 * that carries live settlements. The count is merchant-scoped and only includes
 * operations on/after the contract's effective date, so pre-contract history on
 * the same merchant does not block a fresh contract.
 */

function effectiveFrom(contract: Contract): string {
  return contract.signedAt ?? contract.createdAt;
}

/** Authoritative single-contract count, used by the delete path. */
export async function countContractOrders(contract: Contract): Promise<number> {
  if (!isContractsDatabaseConfigured()) return 0;

  const client = getSupabaseServerClient();
  const { count, error } = await client
    .schema("app")
    .from("operation_logs")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", contract.merchantId)
    .gte("occurred_at", effectiveFrom(contract));

  if (error) {
    // A deployment without the operations table has no orders to protect.
    if (isMissingSchemaObject(error)) return 0;
    throw error;
  }
  return count ?? 0;
}

/**
 * Batch counts for the register's delete hints.
 *
 * Best-effort: the list read must not fail because the aggregate RPC is not
 * deployed yet. The delete path re-checks authoritatively with
 * `countContractOrders`, so a blank hint can never widen what is deletable.
 */
export async function loadContractOrderCounts(
  contractIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const unique = [...new Set(contractIds)];
  if (!isContractsDatabaseConfigured() || unique.length === 0) return counts;

  try {
    const client = getSupabaseServerClient();
    const { data, error } = await client
      .schema("app")
      .rpc("contract_order_counts", { p_contract_ids: unique });
    if (error) {
      if (isMissingSchemaObject(error)) return counts;
      throw error;
    }
    for (const row of (data ?? []) as Array<{
      contract_id: string;
      order_count: number | string;
    }>) {
      counts.set(row.contract_id, Number(row.order_count) || 0);
    }
  } catch (error) {
    console.error("Contract order counts failed", error);
  }
  return counts;
}
