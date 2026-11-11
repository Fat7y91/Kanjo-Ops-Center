import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { BankAccount, LedgerEntry } from "./types";

/**
 * Tier 4 repository for the treasury, backed by the double-entry journal.
 *
 * The central ledger is the single source of truth. A "bank account" here is
 * one of the two bank control accounts in the chart of accounts — `1000` البنك
 * (EGP) and `1000-SAR` بنك الرياض (SAR) — and its balance is read from
 * `app.journal_account_balances`, not a stored or legacy figure. That is what
 * makes a settlement (which debits `1000`) move the treasury screen.
 *
 * The old `app.bank_accounts` registry is metadata only (IBAN, bank name) used
 * to target a capital deposit; it is not read for balances. Registry writes and
 * manual movements live in `movements.ts`, so this file is a pure read module.
 *
 * The row types (`BankAccount`, `LedgerEntry`) are retained so the UI, founder
 * rollup and BI dataset keep one shape while the source changes underneath.
 */

/**
 * The bank control accounts the treasury screen shows.
 *
 * Only the two real bank accounts are surfaced: the Egyptian Bank (`1000`,
 * EGP) and the Saudi Bank (`1000-SAR`, SAR). Cash-on-hand control accounts
 * (`1010*`) are deliberately excluded — they are not part of the PO's workflow
 * and would only clutter the dashboard.
 */
const TREASURY_CODES = ["1000", "1000-SAR"] as const;

const BALANCE_VIEW = "journal_account_balances";
const BALANCE_COLUMNS = "id,code,name,type,currency,balance_minor,debit_total_minor,credit_total_minor";
/**
 * Movements are read from the journal lines joined to their entry and account.
 * `direction` is not stored: a line is exactly one side, so a debit is money in
 * (a deposit) and a credit is money out (an expense).
 */
const LINE_COLUMNS =
  "id,entry_id,account_id,debit_minor,credit_minor,memo,accounts(code,currency),journal_entries(entry_date,memo,created_at)";

type BalanceRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  currency: BankAccount["currency"];
  balance_minor: number | string;
};

type LineRow = {
  id: string;
  entry_id: string;
  account_id: string;
  debit_minor: number | string;
  credit_minor: number | string;
  memo: string | null;
  accounts:
    | { code: string; currency: LedgerEntry["currency"] }
    | { code: string; currency: LedgerEntry["currency"] }[]
    | null;
  journal_entries:
    | { entry_date: string; memo: string | null; created_at: string }
    | { entry_date: string; memo: string | null; created_at: string }[]
    | null;
};

export function isAccountsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function first<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Maps a ledger control account onto the treasury account shape.
 *
 * The row's own `balance_minor` from `journal_account_balances` is carried as
 * `ledgerBalance`, so the dashboard renders the view's figure verbatim instead
 * of re-summing a capped page of lines. Bank names are humanised because the
 * chart-of-accounts labels (`البنك`, `بنك الرياض`) are terse; the dashboard
 * presents the two accounts as "البنك المصري" and "البنك السعودي".
 */
function toAccount(row: BalanceRow): BankAccount {
  const isSar = row.currency === "SAR";
  return {
    id: row.id,
    bankName: isSar ? "البنك السعودي" : "البنك المصري",
    accountName: row.name,
    accountNumber: row.code,
    iban: "",
    country: isSar ? "SA" : "EG",
    currency: row.currency,
    cityId: null,
    active: true,
    createdAt: "",
    ledgerBalance: Number(row.balance_minor) / 100,
  };
}

function toEntry(row: LineRow): LedgerEntry {
  const account = first(row.accounts);
  const entry = first(row.journal_entries);
  const debit = Number(row.debit_minor);
  const amount = debit > 0 ? debit : Number(row.credit_minor);

  return {
    id: row.id,
    accountId: row.account_id,
    // A debit leg on a bank account is cash in; a credit leg is cash out.
    kind: debit > 0 ? "deposit" : "expense",
    label: (row.memo?.trim() || entry?.memo?.trim()) ?? "حركة بنكية",
    amount: amount / 100,
    currency: account?.currency ?? "EGP",
    occurredAt: entry?.entry_date ?? entry?.created_at ?? new Date(0).toISOString(),
    recordedBy: "",
    recordedAt: entry?.created_at ?? "",
  };
}

async function listTreasuryBalanceRows(): Promise<BalanceRow[]> {
  if (!isAccountsDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from(BALANCE_VIEW)
    .select(BALANCE_COLUMNS)
    .in("code", [...TREASURY_CODES])
    .is("party_type", null)
    .order("code", { ascending: true });

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return (data ?? []) as BalanceRow[];
}

export async function listBankAccountRows(): Promise<BankAccount[]> {
  return (await listTreasuryBalanceRows()).map(toAccount);
}

export async function listLedgerRows(
  accountId?: string,
): Promise<LedgerEntry[]> {
  if (!isAccountsDatabaseConfigured()) return [];

  const accounts = await listTreasuryBalanceRows();
  const targetIds = accountId
    ? accounts.filter((account) => account.id === accountId).map((account) => account.id)
    : accounts.map((account) => account.id);

  if (targetIds.length === 0) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_lines")
    .select(LINE_COLUMNS)
    .in("account_id", targetIds)
    .limit(2000);

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }

  // Entry ids are uuids, so ordering by them is meaningless. Sort on the entry
  // date the caller actually reads, newest first.
  return ((data ?? []) as unknown as LineRow[])
    .map(toEntry)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export async function findBankAccountRow(
  accountId: string,
): Promise<BankAccount | null> {
  if (!isAccountsDatabaseConfigured()) return null;

  const accounts = await listTreasuryBalanceRows();
  const match = accounts.find((account) => account.id === accountId);
  return match ? toAccount(match) : null;
}
