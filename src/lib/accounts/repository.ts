import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { actorIdOrNull } from "@/lib/db/actor-id";

import { AccountsError } from "./errors";
import type {
  AccountCountry,
  BankAccount,
  BankAccountInput,
  LedgerEntry,
  LedgerEntryInput,
} from "./types";

/**
 * Tier 4 repository for `app.bank_accounts` and `app.ledger_entries`.
 *
 * This is the only module that knows those column names
 * (`20261030000100_accounts_ledger.sql`). Amounts are stored in minor units and
 * exposed in major units, matching the rest of the domain. There is no seed
 * fallback: an unconfigured deployment reads empty and writes fail loudly.
 *
 * The ledger is append-only in SQL, so this module exposes an insert but no
 * update or delete.
 */

const ACCOUNT_COLUMNS =
  "id,bank_name,account_name,account_number,iban,country_code,currency,city_id,active,created_at";

const LEDGER_COLUMNS =
  "id,account_id,kind,label,amount_minor,currency,occurred_at,recorded_by,recorded_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AccountRow = {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  iban: string;
  country_code: AccountCountry;
  currency: BankAccount["currency"];
  city_id: string | null;
  active: boolean;
  created_at: string;
};

type LedgerRow = {
  id: string;
  account_id: string;
  kind: LedgerEntry["kind"];
  label: string;
  amount_minor: number | string;
  currency: LedgerEntry["currency"];
  occurred_at: string;
  recorded_by: string | null;
  recorded_at: string;
};

/** Seeded operators (`u-*`) are not rows in `app.users`; the FK needs null. */
export function isAccountsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function toAccount(row: AccountRow): BankAccount {
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

function toEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    label: row.label,
    amount: Number(row.amount_minor) / 100,
    currency: row.currency,
    occurredAt: row.occurred_at,
    recordedBy: row.recorded_by ?? "",
    recordedAt: row.recorded_at,
  };
}

export async function listBankAccountRows(): Promise<BankAccount[]> {
  if (!isAccountsDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("bank_accounts")
    .select(ACCOUNT_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as AccountRow[]).map(toAccount);
}

export async function listLedgerRows(
  accountId?: string,
): Promise<LedgerEntry[]> {
  if (!isAccountsDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const base = client
    .schema("app")
    .from("ledger_entries")
    .select(LEDGER_COLUMNS)
    .order("occurred_at", { ascending: true });

  const { data, error } = accountId
    ? await base.eq("account_id", accountId)
    : await base;

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as LedgerRow[]).map(toEntry);
}

export async function findBankAccountRow(
  accountId: string,
): Promise<BankAccount | null> {
  if (!isAccountsDatabaseConfigured() || !UUID.test(accountId)) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("bank_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return data ? toAccount(data as unknown as AccountRow) : null;
}

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
    .select(ACCOUNT_COLUMNS)
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new AccountsError(
        "STORE_UNAVAILABLE",
        "الخزينة غير متاحة على هذا النشر بعد.",
        503,
      );
    }
    if (isUniqueViolation(error)) {
      throw new AccountsError("DUPLICATE_IBAN", "رقم الآيبان مسجّل مسبقاً.", 409);
    }
    throw error;
  }
  return toAccount(data as unknown as AccountRow);
}

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
  const { data, error } = await client
    .schema("app")
    .from("ledger_entries")
    .insert({
      account_id: account.id,
      kind: input.kind,
      label: input.label,
      amount_minor: Math.round(input.amount * 100),
      currency: account.currency,
      occurred_at: input.occurredAt,
      recorded_by: actorIdOrNull(recordedBy),
    })
    .select(LEDGER_COLUMNS)
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
  return toEntry(data as unknown as LedgerRow);
}
