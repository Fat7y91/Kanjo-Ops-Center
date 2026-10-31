import {
  ACCOUNT_COUNTRY_META,
  BANK_ACCOUNT_INPUT,
  LEDGER_ENTRY_INPUT,
  type BankAccount,
  type BankAccountInput,
  type LedgerEntry,
  type LedgerEntryInput,
} from "./types";
import { seedBankAccounts, seedLedgerEntries } from "./seed";

export class AccountsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AccountsError";
    this.code = code;
    this.status = status;
  }
}

type AccountsStore = {
  accounts: BankAccount[];
  ledger: LedgerEntry[];
  revision: number;
};

const globalStore = globalThis as typeof globalThis & {
  __kanjoV2AccountsStore?: AccountsStore;
};

function getStore(): AccountsStore {
  if (!globalStore.__kanjoV2AccountsStore) {
    globalStore.__kanjoV2AccountsStore = {
      accounts: seedBankAccounts(),
      ledger: seedLedgerEntries(),
      revision: 1,
    };
  }
  return globalStore.__kanjoV2AccountsStore;
}

export function accountsRevision(): number {
  return getStore().revision;
}

export function listBankAccounts(): BankAccount[] {
  return structuredClone(getStore().accounts);
}

export function listLedgerEntries(accountId?: string): LedgerEntry[] {
  const entries = structuredClone(getStore().ledger);
  return accountId
    ? entries.filter((entry) => entry.accountId === accountId)
    : entries;
}

export function findBankAccount(id: string): BankAccount | null {
  return getStore().accounts.find((account) => account.id === id) ?? null;
}

export function createBankAccount(input: BankAccountInput): BankAccount {
  const parsed = BANK_ACCOUNT_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new AccountsError(
      "INVALID_ACCOUNT",
      "بيانات الحساب البنكي غير مكتملة أو غير صالحة.",
    );
  }
  const store = getStore();
  const duplicate = store.accounts.some(
    (account) => account.iban.replace(/\s/g, "") === parsed.data.iban.replace(/\s/g, ""),
  );
  if (duplicate) {
    throw new AccountsError("DUPLICATE_IBAN", "رقم الآيبان مسجّل مسبقاً.");
  }

  const account: BankAccount = {
    id: `bank-${crypto.randomUUID().slice(0, 8)}`,
    bankName: parsed.data.bankName,
    accountName: parsed.data.accountName,
    accountNumber: parsed.data.accountNumber,
    iban: parsed.data.iban,
    country: parsed.data.country,
    currency: ACCOUNT_COUNTRY_META[parsed.data.country].currency,
    cityId: null,
    active: true,
    createdAt: new Date().toISOString(),
  };
  store.accounts = [account, ...store.accounts];
  store.revision += 1;
  return structuredClone(account);
}

/**
 * Appends a money movement.
 *
 * Amounts are stored in the account currency, not the caller's, so a ledger can
 * never mix denominations. There is no update or delete path by design.
 */
export function appendLedgerEntry(
  input: LedgerEntryInput,
  recordedBy: string,
): LedgerEntry {
  const parsed = LEDGER_ENTRY_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new AccountsError(
      "INVALID_ENTRY",
      "بيانات الحركة المالية غير مكتملة أو غير صالحة.",
    );
  }
  const account = findBankAccount(parsed.data.accountId);
  if (!account) {
    throw new AccountsError("ACCOUNT_NOT_FOUND", "الحساب البنكي غير موجود.", 404);
  }

  const store = getStore();
  const entry: LedgerEntry = {
    id: `led-${crypto.randomUUID().slice(0, 8)}`,
    accountId: account.id,
    kind: parsed.data.kind,
    label: parsed.data.label,
    amount: parsed.data.amount,
    currency: account.currency,
    occurredAt: parsed.data.occurredAt,
    recordedBy,
    recordedAt: new Date().toISOString(),
  };
  store.ledger = [...store.ledger, entry];
  store.revision += 1;
  return structuredClone(entry);
}
