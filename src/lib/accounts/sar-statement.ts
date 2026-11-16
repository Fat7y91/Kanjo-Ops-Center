import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { LedgerEntry } from "./types";

/**
 * SAR treasury projection over the migrated financial tables.
 *
 * The journal is still the source of truth for EGP, but the legacy workbook was
 * imported into `app.capital_deposits` and `app.expenses` instead of the
 * double-entry journal. This module turns those rows into the same
 * `LedgerEntry` shape the treasury screen already renders, and reads the
 * authoritative closing balance from `app.bank_statement_sar`.
 */

type DepositRow = {
  id: string;
  amount_sar: number | string;
  deposit_date: string;
  created_at: string | null;
  reference_number: string | null;
  reason: string | null;
};

type ExpenseRow = {
  id: string;
  amount_sar: number | string;
  expense_date: string;
  created_at: string | null;
  reference_number: string | null;
  details: string | null;
  category_id: string;
};

type CategoryRow = {
  id: string;
  name_ar: string;
};

type BalanceRow = {
  balance_sar: number | string;
};

function amount(value: number | string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function signedAmount(value: number | string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function toDeposit(
  row: DepositRow,
  accountId: string,
  capital: boolean,
): LedgerEntry | null {
  const value = amount(row.amount_sar);
  if (value === null) return null;
  return {
    id: `sar-deposit:${row.id}`,
    entryId: "",
    accountId,
    kind: "deposit",
    label: clean(row.reason) || (capital ? "إيداع رأسمالي" : "إيداع بنكي"),
    counterparty: capital ? "رأس المال" : "إيداع بنكي",
    amount: value,
    currency: "SAR",
    occurredAt: row.deposit_date,
    recordedBy: "",
    recordedAt: row.created_at ?? row.deposit_date,
  };
}

function toExpense(
  row: ExpenseRow,
  accountId: string,
  categories: Map<string, string>,
): LedgerEntry | null {
  const value = amount(row.amount_sar);
  if (value === null) return null;
  const category = categories.get(row.category_id) ?? "مصروفات";
  const details = clean(row.details);
  return {
    id: `sar-expense:${row.id}`,
    entryId: "",
    accountId,
    kind: "expense",
    label: details || category,
    counterparty: category,
    amount: value,
    currency: "SAR",
    occurredAt: row.expense_date,
    recordedBy: "",
    recordedAt: row.created_at ?? row.expense_date,
  };
}

export async function loadSarBalance(): Promise<number | null> {
  try {
    const client = getSupabaseServerClient();
    const { data, error } = await client
      .schema("app")
      .from("bank_statement_sar")
      .select("balance_sar")
      .order("entry_date", { ascending: false })
      .order("recorded_at", { ascending: false })
      .order("entry_type", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      if (isMissingSchemaObject(error)) return null;
      throw error;
    }
    const value = (data as BalanceRow[] | null)?.[0]?.balance_sar;
    return value === undefined ? 0 : signedAmount(value);
  } catch (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
}

export async function loadSarEntries(accountId: string): Promise<LedgerEntry[]> {
  const client = getSupabaseServerClient();

  const [deposits, directDeposits, expenses, categories] = await Promise.all([
    client
      .schema("app")
      .from("capital_deposits")
      .select("id,amount_sar,deposit_date,created_at,reference_number,reason")
      .eq("currency", "SAR")
      .neq("status", "rejected"),
    client
      .schema("app")
      .from("sar_bank_deposits")
      .select("id,amount_sar,deposit_date,created_at,reference_number,reason"),
    client
      .schema("app")
      .from("expenses")
      .select("id,amount_sar,expense_date,created_at,reference_number,details,category_id"),
    client.schema("app").from("expense_categories").select("id,name_ar"),
  ]);

  for (const result of [deposits, directDeposits, expenses, categories]) {
    if (result.error) {
      if (isMissingSchemaObject(result.error)) return [];
      throw result.error;
    }
  }

  const categoryNames = new Map(
    ((categories.data ?? []) as CategoryRow[]).map((row) => [row.id, row.name_ar]),
  );

  const entries = [
    ...((deposits.data ?? []) as DepositRow[])
      .map((row) => toDeposit(row, accountId, true))
      .filter((row): row is LedgerEntry => row !== null),
    ...((directDeposits.data ?? []) as DepositRow[])
      .map((row) => toDeposit(row, accountId, false))
      .filter((row): row is LedgerEntry => row !== null),
    ...((expenses.data ?? []) as ExpenseRow[])
      .map((row) => toExpense(row, accountId, categoryNames))
      .filter((row): row is LedgerEntry => row !== null),
  ];

  return entries.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}
