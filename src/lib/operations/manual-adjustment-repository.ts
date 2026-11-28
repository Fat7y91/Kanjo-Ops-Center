import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { OperationsError } from "./errors";
import type { AdjustmentPartyType } from "./manual-adjustment";
import { toMinorUnits } from "./types";
import type { ManualAdjustmentInput } from "./types";

/**
 * Resolves a `courier:<id>` / `merchant:<id>` reference to its ledger account.
 *
 * Courier party ids are courier UUIDs; merchant party ids are the merchant
 * code. EGP is preferred when a party somehow has more than one currency.
 */
export async function resolvePartyLedgerAccount(
  partyType: AdjustmentPartyType,
  partyId: string,
): Promise<string> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("accounts")
    .select("id")
    .eq("party_type", partyType)
    .eq("party_id", partyId)
    .order("currency", { ascending: true })
    .limit(1);

  if (error) throw error;

  const id = (data?.[0] as { id?: string } | undefined)?.id;
  if (!id) {
    throw new OperationsError(
      "ADJUSTMENT_ACCOUNT_MISSING",
      "لا يوجد حساب دفتر أستاذ مطابق لهذا الطرف.",
      404,
    );
  }
  return id;
}

export async function postManualAdjustment(
  accountId: string,
  actorId: string,
  input: ManualAdjustmentInput,
): Promise<string> {
  const client = getSupabaseServerClient();
  const { data, error } = await client.schema("app").rpc(
    "post_manual_adjustment",
    {
      p_account_id: accountId,
      p_direction: input.direction,
      p_amount_minor: toMinorUnits(input.amount),
      p_entry_date: input.entryDate,
      p_reason: input.reason,
      p_actor: actorId,
    },
  );

  if (error) throw error;
  return data as string;
}
