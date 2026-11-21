import "server-only";

import { actorIdOrNull } from "@/lib/db/actor-id";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { AccountsError } from "./errors";
import type { BankAccount, LedgerEntry, LedgerEntryInput } from "./types";

/**
 * Saudi bank writes.
 *
 * The Saudi ledger is not the EGP journal: its balance is the running total of
 * the imported deposit/expense tables plus the direct deposits recorded here.
 * Expenses land in `app.expenses` so both currencies share the same analytical
 * category tree; direct deposits get their own table so a day-to-day bank
 * credit is never disguised as founder capital.
 */

function day(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AccountsError("INVALID_ENTRY", "تاريخ الحركة غير صالح.");
  }
  return parsed.toISOString().slice(0, 10);
}

function amount(value: number): number {
  return Math.round(value * 100) / 100;
}

async function categoryName(id: string): Promise<string> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("expense_categories")
    .select("name_ar,active")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new AccountsError(
        "STORE_UNAVAILABLE",
        "بنود المصروفات غير متاحة على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }
  const row = data as { name_ar: string; active: boolean } | null;
  if (!row || !row.active) {
    throw new AccountsError(
      "INVALID_ENTRY",
      "البند الرئيسي غير موجود أو غير نشط.",
    );
  }
  return row.name_ar;
}

export async function insertSarDeposit(
  account: BankAccount,
  input: LedgerEntryInput,
  recordedBy: string | null,
): Promise<LedgerEntry> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("sar_bank_deposits")
    .insert({
      account_id: account.id,
      amount_sar: amount(input.amount),
      deposit_date: day(input.occurredAt),
      reason: input.label,
      created_by: actorIdOrNull(recordedBy),
    })
    .select("id,deposit_date,created_at")
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new AccountsError(
        "STORE_UNAVAILABLE",
        "حركات البنك السعودي غير متاحة على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }

  const row = data as { id: string; deposit_date: string; created_at: string };
  return {
    id: `sar-deposit:${row.id}`,
    entryId: "",
    accountId: account.id,
    kind: "deposit",
    label: input.label,
    counterparty: "إيداع بنكي",
    amount: amount(input.amount),
    currency: "SAR",
    occurredAt: row.deposit_date,
    recordedBy: recordedBy ?? "",
    recordedAt: row.created_at,
  };
}

export async function insertSarExpense(
  account: BankAccount,
  input: LedgerEntryInput,
  recordedBy: string | null,
): Promise<LedgerEntry> {
  if (!input.categoryId) {
    throw new AccountsError(
      "INVALID_ENTRY",
      "اختر البند الرئيسي للمصروف قبل التسجيل.",
    );
  }

  const name = await categoryName(input.categoryId);
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("expenses")
    .insert({
      category_id: input.categoryId,
      amount_sar: amount(input.amount),
      expense_date: day(input.occurredAt),
      details: input.label,
      created_by: actorIdOrNull(recordedBy),
    })
    .select("id,expense_date,created_at")
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new AccountsError(
        "STORE_UNAVAILABLE",
        "مصروفات البنك السعودي غير متاحة على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }

  const row = data as { id: string; expense_date: string; created_at: string };
  return {
    id: `sar-expense:${row.id}`,
    entryId: "",
    accountId: account.id,
    kind: "expense",
    label: input.label,
    counterparty: name,
    amount: amount(input.amount),
    currency: "SAR",
    occurredAt: row.expense_date,
    recordedBy: recordedBy ?? "",
    recordedAt: row.created_at,
  };
}
