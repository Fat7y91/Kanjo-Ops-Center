import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { actorIdOrNull } from "@/lib/db/actor-id";

import { AccountsError } from "./errors";
import type {
  BankAccount,
  BankAccountInput,
  LedgerEntry,
  LedgerEntryInput,
} from "./types";

/**
 * Tier 4 repository for the treasury, backed by the double-entry journal.
 *
 * The central ledger is the single source of truth. A "bank account" here is one
 * of the bank/cash control accounts in the chart of accounts — `1000` البنك and
 * `1010` النقدية بالخزينة — and its balance is derived from `journal_lines`, not
 * a stored or legacy figure. That is what makes a settlement (which debits
 * `1000`) move the treasury screen.
 *
 * The old `app.bank_accounts` registry is metadata only (IBAN, bank name) used to
 * target a capital deposit; it is not read for balances.
 *
 * The row types (`BankAccount`, `LedgerEntry`) are retained so the UI, founder
 * rollup and BI dataset keep one shape while the source changes underneath.
 */

/**
 * The asset control accounts that represent money Kanjo can spend.
 *
 * `1000` bank and `1010` cash are the EGP book; a currency-suffixed variant
 * (`1000-SAR`, `1010-SAR`) holds another denomination, because account `code`
 * is unique and a control account may not be duplicated across currencies.
 */
const TREASURY_CODE_FILTER =
  "code.eq.1000,code.eq.1010,code.like.1000-*,code.like.1010-*";

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
 * `accountNumber` carries the account code and `iban` is left empty: an IBAN is
 * a property of a registry row, not of the ledger control account, and showing
 * a fabricated one would be worse than showing none.
 */
function toAccount(row: BalanceRow): BankAccount {
  return {
    id: row.id,
    bankName: row.name,
    accountName: row.name,
    accountNumber: row.code,
    iban: "",
    country: row.currency === "SAR" ? "SA" : "EG",
    currency: row.currency,
    cityId: null,
    active: true,
    createdAt: "",
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
    .or(TREASURY_CODE_FILTER)
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

/**
 * Registers an IBAN as a capital-deposit target.
 *
 * This is metadata, not a ledger account: the treasury balances come from the
 * fixed bank/cash control accounts. Kept so an operator can add a destination
 * the finance review flow can approve into.
 */
export async function insertBankAccount(
  input: BankAccountInput,
  createdBy: string | null,
): Promise<BankAccount> {
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
    .from("bank_accounts")
    .insert({
      bank_name: input.bankName,
      account_name: input.accountName,
      account_number: input.accountNumber,
      iban: input.iban.replace(/\s/g, "").toUpperCase(),
      country_code: input.country,
      currency: input.country === "SA" ? "SAR" : "EGP",
      created_by: actorIdOrNull(createdBy),
    })
    .select(
      "id,bank_name,account_name,account_number,iban,country_code,currency,city_id,active,created_at",
    )
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new AccountsError(
        "STORE_UNAVAILABLE",
        "الخزينة غير متاحة على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }
  const row = data as unknown as {
    id: string;
    bank_name: string;
    account_name: string;
    account_number: string;
    iban: string;
    country_code: BankAccount["country"];
    currency: BankAccount["currency"];
    city_id: string | null;
    active: boolean;
    created_at: string;
  };
  return {
    id: row.id,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    iban: row.iban,
    country: row.country_code,
    currency: row.currency,
    cityId: row.city_id,
    active: row.active,
    createdAt: row.created_at,
  };
}

/**
 * Posts a bank movement to the journal.
 *
 * The SQL function writes one balanced entry and derives nothing in the client,
 * so the balance the operator sees next is the journal's own arithmetic. The
 * returned entry mirrors the posted movement for the caller's optimistic list.
 */
export async function insertLedgerEntry(
  account: BankAccount,
  input: LedgerEntryInput,
  recordedBy: string | null,
): Promise<LedgerEntry> {
  if (!isAccountsDatabaseConfigured()) {
    throw new AccountsError(
      "STORE_UNAVAILABLE",
      "الخزينة غير متاحة على هذا النشر بعد.",
      503,
    );
  }

  const client = getSupabaseServerClient();
  const amountMinor = Math.round(input.amount * 100);
  const { data, error } = await client
    .schema("app")
    .rpc("post_bank_movement", {
      p_account_id: account.id,
      p_kind: input.kind,
      p_label: input.label,
      p_amount_minor: amountMinor,
      p_occurred_at: input.occurredAt,
      p_actor: actorIdOrNull(recordedBy),
    });

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new AccountsError(
        "STORE_UNAVAILABLE",
        "الخزينة غير متاحة على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }

  return {
    id: typeof data === "string" ? data : `movement-${Date.now()}`,
    accountId: account.id,
    kind: input.kind,
    label: input.label,
    amount: input.amount,
    currency: account.currency,
    occurredAt: input.occurredAt,
    recordedBy: recordedBy ?? "",
    recordedAt: new Date().toISOString(),
  };
}
