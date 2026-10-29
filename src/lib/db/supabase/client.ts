import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/db/supabase/config";

/**
 * Browser / anon-key client. Safe to import from client components; Row Level
 * Security remains the only authority. The instance is memoised per browser
 * tab, not per request.
 */
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  browserClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return browserClient;
}
