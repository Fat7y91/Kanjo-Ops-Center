import { optionalEnv, requireEnv } from "@/lib/db/env";

/**
 * Supabase holds the Financial / ERP domain: users, RBAC, ledgers, wallets
 * and commissions. Configuration is read lazily so importing the module never
 * throws during a build that has no database attached.
 */
export type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export function getSupabaseUrl(): string {
  return requireEnv("SUPABASE_URL");
}

export function getSupabaseAnonKey(): string {
  return requireEnv("SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: getSupabaseUrl(),
    serviceRoleKey: getSupabaseServiceRoleKey(),
  };
}

export function hasSupabaseConfig(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    optionalEnv("SUPABASE_URL", source) &&
      optionalEnv("SUPABASE_SERVICE_ROLE_KEY", source),
  );
}
