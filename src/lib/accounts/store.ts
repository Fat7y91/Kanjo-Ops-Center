import {
  BANK_ACCOUNT_INPUT,
  LEDGER_ENTRY_INPUT,
  type BankAccount,
  type BankAccountInput,
  type LedgerEntry,
  type LedgerEntryInput,
} from "./types";
import { AccountsError } from "./errors";
import {
  findBankAccountRow,
  isAccountsDatabaseConfigured,
  listBankAccountRows,
  listLedgerRows,
} from "./repository";
import { insertBankAccount, insertLedgerEntry } from "./movements";

export { AccountsError };

/**
 * Tier 3 treasury rules over `app.bank_accounts` / `app.ledger_entries`.
 *
 * The ledger is the single source of truth and there is no seed: a deployment
 * without a database reads empty rather than inventing balances, and a write
 * fails loudly instead of being acknowledged and dropped. Balance is never
 * stored — it is derived from the append-only entries by `ledger.ts`.
 */

export function isAccountsConfigured(): boolean {
  return isAccountsDatabaseConfigured();
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  return listBankAccountRows();
}

export async function listLedgerEntries(
  accountId?: string,
): Promise<LedgerEntry[]> {
  return listLedgerRows(accountId);
}

export async function findBankAccount(
  id: string,
): Promise<BankAccount | null> {
  return findBankAccountRow(id);
}

export async function createBankAccount(
  input: BankAccountInput,
  createdBy: string | null,
): Promise<BankAccount> {
  const parsed = BANK_ACCOUNT_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new AccountsError(
      "INVALID_ACCOUNT",
      "بيانات الحساب البنكي غير مكتملة أو غير صالحة.",
    );
  }
  const accounts = await listBankAccountRows();
  const candidate = parsed.data.iban.replace(/\s/g, "").toUpperCase();
  // Ledger control accounts carry no IBAN; only real registry rows can collide.
  const duplicate = accounts.some(
    (account) =>
      account.iban !== "" &&
      account.iban.replace(/\s/g, "").toUpperCase() === candidate,
  );
  if (duplicate) {
    throw new AccountsError("DUPLICATE_IBAN", "رقم الآيبان مسجّل مسبقاً.");
  }

  return insertBankAccount(parsed.data, createdBy);
}

/**
 * Appends a money movement.
 *
 * Amounts are stored in the account currency, not the caller's, so a ledger can
 * never mix denominations. There is no update or delete path by design.
 */
export async function appendLedgerEntry(
  input: LedgerEntryInput,
  recordedBy: string | null,
): Promise<LedgerEntry> {
  const parsed = LEDGER_ENTRY_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new AccountsError(
      "INVALID_ENTRY",
      "بيانات الحركة المالية غير مكتملة أو غير صالحة.",
    );
  }
  const account = await findBankAccountRow(parsed.data.accountId);
  if (!account) {
    throw new AccountsError("ACCOUNT_NOT_FOUND", "الحساب البنكي غير موجود.", 404);
  }

  return insertLedgerEntry(account, parsed.data, recordedBy);
}
