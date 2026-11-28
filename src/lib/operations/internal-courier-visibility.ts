import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { INTERNAL_COURIER_NAME } from "./clearinghouse-view";
import { parseAdjustmentAccountRef } from "./manual-adjustment";
import { findPartyAccount } from "./statement-repository";

/**
 * Founder-only visibility for internal courier parties.
 *
 * The account list and reports filter internal rows, but a hand-crafted request
 * can still name an internal ledger account. These helpers close that gap: the
 * statement and adjustment routes call them before touching the ledger, and a
 * non-founder gets 403 instead of the internal accounting detail.
 */

type InternalCourierRow = {
  display_name: string | null;
  is_internal_staff: boolean | null;
};

/**
 * Authoritative check for one courier party.
 *
 * Throws on a database failure (fail closed): an unreadable flag must not be
 * treated as "external" and expose an internal ledger.
 */
export async function isInternalCourierParty(
  courierId: string,
): Promise<boolean> {
  if (courierId === "") return false;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select("display_name,is_internal_staff")
    .eq("id", courierId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return false;
    throw error;
  }
  if (!data) return false;

  const row = data as InternalCourierRow;
  return (
    Boolean(row.is_internal_staff) ||
    INTERNAL_COURIER_NAME.test(row.display_name ?? "")
  );
}

/**
 * Whether a raw account id or a `courier:`/`merchant:` ref points at an
 * internal courier. Merchants are never internal by this rule.
 */
export async function partyAccountIsInternal(
  accountRef: string,
): Promise<boolean> {
  const ref = parseAdjustmentAccountRef(accountRef);
  if (!ref) return false;

  if (ref.kind === "party") {
    return (
      ref.partyType === "courier" &&
      (await isInternalCourierParty(ref.partyId))
    );
  }

  const account = await findPartyAccount(ref.accountId);
  if (!account || account.partyType !== "courier") return false;
  return isInternalCourierParty(account.partyId);
}
