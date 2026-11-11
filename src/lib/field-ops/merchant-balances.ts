import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Live net position of each merchant against the house.
 *
 * A merchant can hold two party ledger accounts: `1100` (COD receivable, a
 * debit-normal asset) and `2000` (ONLINE payable, a credit-normal liability).
 * The view reports `debit − credit` per account, so summing both accounts gives
 * one signed figure per merchant:
 *
 *   > 0  the merchant owes Kanjo (a receivable)
 *   < 0  Kanjo owes the merchant (a payable)
 *   = 0  the account is settled
 *
 * Nothing is stored; the number is derived from the same journal the
 * clearinghouse settles, so the directory can never disagree with the books. A
 * missing view degrades to zero rather than blanking the directory.
 */
export type MerchantBalance = {
  /** Signed net position in major units (positive = owed to Kanjo). */
  net: number;
};

export async function loadMerchantBalances(
  merchantIds: readonly string[],
): Promise<Map<string, MerchantBalance>> {
  const balances = new Map<string, MerchantBalance>();
  const unique = [...new Set(merchantIds.filter((id) => id !== ""))];
  if (unique.length === 0) return balances;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_account_balances")
    .select("party_id,balance_minor")
    .eq("party_type", "merchant")
    .in("party_id", unique)
    .limit(5000);

  if (error) {
    if (isMissingSchemaObject(error)) return balances;
    throw error;
  }

  for (const row of (data ?? []) as {
    party_id: string | null;
    balance_minor: number | string;
  }[]) {
    if (!row.party_id) continue;
    const current = balances.get(row.party_id)?.net ?? 0;
    balances.set(row.party_id, {
      net: current + Number(row.balance_minor) / 100,
    });
  }

  return balances;
}
