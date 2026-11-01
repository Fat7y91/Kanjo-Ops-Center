import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type {
  CapitalDeposit,
  CapitalStatus,
} from "./capital";

/**
 * Tier 4 repository for founder capital deposits.
 *
 * Split from `repository.ts` so each table group stays under the file-size
 * limit. Approval relies on the SQL trigger to append the ledger entry in the
 * same transaction; this module never writes the ledger itself.
 */

type CapitalRow = {
  id: string;
  founder_id: string;
  amount_minor: number;
  currency: "EGP" | "SAR";
  account_id: string | null;
  receipt_path: string | null;
  note: string;
  status: CapitalStatus;
  decided_by: string | null;
  decided_at: string | null;
  ledger_entry_id: string | null;
  created_at: string;
  users: { full_name: string } | { full_name: string }[] | null;
};

const CAPITAL_COLUMNS =
  "id,founder_id,amount_minor,currency,account_id,receipt_path,note,status,decided_by,decided_at,ledger_entry_id,created_at,users!founder_id(full_name)";

const CAPITAL_COLUMNS_NO_JOIN =
  "id,founder_id,amount_minor,currency,account_id,receipt_path,note,status,decided_by,decided_at,ledger_entry_id,created_at";

function joinedName(row: CapitalRow): string {
  const embed = row.users;
  const value = Array.isArray(embed) ? embed[0]?.full_name : embed?.full_name;
  return value && value.trim() !== "" ? value : "مؤسس";
}

export function toCapitalDeposit(row: CapitalRow): CapitalDeposit {
  return {
    id: row.id,
    founderId: row.founder_id,
    founderName: joinedName(row),
    amount: Number(row.amount_minor),
    currency: row.currency,
    accountId: row.account_id,
    receiptPath: row.receipt_path,
    note: row.note,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    ledgerEntryId: row.ledger_entry_id,
    createdAt: row.created_at,
  };
}

/* ── Treasury accounts (approval targets) ───────────────────────────────── */

export type TreasuryAccount = {
  id: string;
  bankName: string;
  currency: "EGP" | "SAR";
  country: "EG" | "SA";
};

type BankAccountRow = {
  id: string;
  bank_name: string;
  currency: "EGP" | "SAR";
  country_code: "EG" | "SA";
};

/**
 * Active accounts a capital deposit may be credited to.
 *
 * Approval names one of these; the SQL trigger refuses an account whose
 * currency differs from the deposit, so the picker is filtered by currency on
 * the client as well.
 */
export async function listTreasuryAccounts(): Promise<TreasuryAccount[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("bank_accounts")
    .select("id,bank_name,currency,country_code")
    .eq("active", true)
    .order("currency", { ascending: true });

  if (error && isMissingSchemaObject(error)) return [];
  if (error) throw error;

  return ((data ?? []) as BankAccountRow[]).map((row) => ({
    id: row.id,
    bankName: row.bank_name,
    currency: row.currency,
    country: row.country_code,
  }));
}

/* ── Founder capital ────────────────────────────────────────────────────── */

export async function listCapitalDeposits(founderId?: string): Promise<
  CapitalDeposit[]
> {
  const client = getSupabaseServerClient();
  const query = (columns: string) =>
    client
      .schema("app")
      .from("capital_deposits")
      .select(columns)
      .order("created_at", { ascending: false });

  const scoped = (columns: string) => {
    const base = query(columns);
    return founderId ? base.eq("founder_id", founderId) : base;
  };

  const primary = await scoped(CAPITAL_COLUMNS);
  if (!primary.error) {
    return ((primary.data ?? []) as unknown as CapitalRow[]).map(toCapitalDeposit);
  }
  if (!isMissingSchemaObject(primary.error)) throw primary.error;

  // The embedded name is a convenience; without the relation the row still
  // renders, with the generic founder label.
  const fallback = await scoped(CAPITAL_COLUMNS_NO_JOIN);
  if (fallback.error && isMissingSchemaObject(fallback.error)) return [];
  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as unknown as CapitalRow[]).map(toCapitalDeposit);
}

export async function findCapitalDeposit(
  id: string,
): Promise<CapitalDeposit | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("capital_deposits")
    .select(CAPITAL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toCapitalDeposit(data as unknown as CapitalRow) : null;
}

export async function insertCapitalDeposit(write: {
  founderId: string;
  amountMinor: number;
  currency: "EGP" | "SAR";
  receiptPath: string | null;
  note: string;
}): Promise<CapitalDeposit> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("capital_deposits")
    .insert({
      founder_id: write.founderId,
      amount_minor: write.amountMinor,
      currency: write.currency,
      receipt_path: write.receiptPath,
      note: write.note,
      status: "pending",
    })
    .select(CAPITAL_COLUMNS)
    .single();

  if (error) throw error;
  return toCapitalDeposit(data as unknown as CapitalRow);
}

/**
 * Records a decision. Approval also names the treasury account; the SQL trigger
 * then appends the ledger entry in the same transaction, so a failure leaves
 * neither a half-approved deposit nor an unbacked credit.
 */
export async function decideCapitalDeposit(
  id: string,
  decision: {
    status: Exclude<CapitalStatus, "pending">;
    decidedBy: string;
    accountId?: string | null;
  },
): Promise<CapitalDeposit> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("capital_deposits")
    .update({
      status: decision.status,
      decided_by: decision.decidedBy,
      decided_at: new Date().toISOString(),
      ...(decision.accountId ? { account_id: decision.accountId } : {}),
    })
    .eq("id", id)
    .select(CAPITAL_COLUMNS)
    .single();

  if (error) throw error;
  return toCapitalDeposit(data as unknown as CapitalRow);
}
