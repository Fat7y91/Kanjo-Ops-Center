import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Bulk clear of one merchant's catalog.
 *
 * The delete is scoped by `merchant_id` at the database, not by filtering an
 * in-memory list, so a Merchant B row can never be caught by a Merchant A
 * request. Only `app.catalog_products` is touched: the merchant record, the
 * posted operations and every journal entry are outside this statement.
 *
 * The optional client exists so the scoping rule can be exercised without a
 * live database; production always uses the service-role client.
 */
export async function clearMerchantCatalog(
  merchantId: string,
  options: { client?: SupabaseClient } = {},
): Promise<number> {
  const id = typeof merchantId === "string" ? merchantId.trim() : "";
  /* A missing id must never degrade into "delete every row". */
  if (id === "" || id.length > 64) {
    throw new Error("INVALID_MERCHANT_ID");
  }

  const client = options.client ?? getSupabaseServerClient();
  const { count, error } = await client
    .schema("app")
    .from("catalog_products")
    .delete({ count: "exact" })
    .eq("merchant_id", id);

  if (error) throw error;
  return count ?? 0;
}
