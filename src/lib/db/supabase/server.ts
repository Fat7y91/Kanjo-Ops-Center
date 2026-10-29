import "server-only";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/db/supabase/config";

/**
 * Server-side client used by Tier 4 repositories (ledgers, wallets,
 * commissions, RBAC writes). It bypasses Row Level Security, so it must never
 * reach client code. Cache is scoped to the current request/isolate; an
 * official request-scoped factory replaces this once the repositories land.
 */
let serverClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (serverClient) return serverClient;

  serverClient = createClient(
    getSupabaseUrl(),
    getSupabaseServiceRoleKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { "X-Client-Info": "kanjo-v2-server" },
      },
    },
  );

  return serverClient;
}
