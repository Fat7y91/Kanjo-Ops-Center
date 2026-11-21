import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { AccountsError } from "./errors";
import { isAccountsDatabaseConfigured } from "./repository";

/**
 * Tier 4 write for a manual FX transfer.
 *
 * The posting itself is a single SQL function so the four legs (two per bank
 * ledger plus their suspense contra accounts) commit together or not at all.
 * The receipt rides on the same entry, which means the voucher opened from
 * either bank will show the transfer receipt.
 */

export type FxTransferPosting = {
  sarAmountMinor: number;
  egpAmountMinor: number;
  label: string;
  occurredAt: string;
  actorId: string;
  receiptNo: string | null;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export async function postFxTransfer(
  posting: FxTransferPosting,
): Promise<string> {
  if (!isAccountsDatabaseConfigured()) {
    throw new AccountsError(
      "STORE_UNAVAILABLE",
      "الخزينة غير متاحة على هذا النشر بعد.",
      503,
    );
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .rpc("post_fx_transfer", {
      p_sar_amount_minor: posting.sarAmountMinor,
      p_egp_amount_minor: posting.egpAmountMinor,
      p_label: posting.label,
      p_occurred_at: posting.occurredAt,
      p_actor: posting.actorId,
      p_receipt_no: posting.receiptNo,
      p_storage_path: posting.storagePath,
      p_mime_type: posting.mimeType,
      p_size_bytes: posting.sizeBytes,
    });

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new AccountsError(
        "STORE_UNAVAILABLE",
        "تحويل العملات غير متاح على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }
  return typeof data === "string" ? data : String(data);
}
