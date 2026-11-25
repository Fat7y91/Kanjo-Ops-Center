import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { toMinorUnits } from "./types";
import type { ManualAdjustmentInput } from "./types";

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
