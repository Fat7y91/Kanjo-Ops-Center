import "server-only";

import { actorIdOrNull } from "@/lib/db/actor-id";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { AccountsError } from "./errors";
import { isAccountsDatabaseConfigured } from "./repository";
import type {
  BankAccount,
  BankAccountInput,
  LedgerEntry,
  LedgerEntryInput,
} from "./types";

/**
 * Tier 4 treasury writes.
 *
 * A registry row is metadata for a capital-deposit target; a manual movement is
 * a journal entry posted by `app.post_bank_movement` (EGP-only, enforced in
 * SQL). Kept apart from the read repository so the balance-read module stays a
 * pure projection of the journal.
 */

/**
 * Registers an IBAN as a capital-deposit target.
 *
 * This is metadata, not a ledger account: the treasury balances come from the
 * fixed bank control accounts. Kept so an operator can add a destination the
 * finance review flow can approve into.
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
    ledgerBalance: null,
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

  // `post_bank_movement` returns the journal entry id, not a line id. The
  // optimistic row is keyed on it, so the drill-down works before the list is
  // reloaded.
  const entryId = typeof data === "string" ? data : `movement-${Date.now()}`;

  return {
    id: entryId,
    entryId,
    accountId: account.id,
    kind: input.kind,
    label: input.label,
    // The counterparty is the contra account the SQL function picked
    // (`3000` for a deposit, `5400` for an expense); the reload resolves it.
    counterparty: input.kind === "deposit" ? "رأس المال" : "مصروفات تشغيلية",
    amount: input.amount,
    currency: account.currency,
    occurredAt: input.occurredAt,
    recordedBy: recordedBy ?? "",
    recordedAt: new Date().toISOString(),
  };
}
