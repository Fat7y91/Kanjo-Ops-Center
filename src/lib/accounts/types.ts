import { z } from "zod";

/** Countries a bank account can be opened in. Currency follows the country. */
export const ACCOUNT_COUNTRIES = ["EG", "SA"] as const;
export type AccountCountry = (typeof ACCOUNT_COUNTRIES)[number];

export const ACCOUNT_COUNTRY_META: Record<
  AccountCountry,
  { label: string; currency: "EGP" | "SAR" }
> = {
  EG: { label: "مصر", currency: "EGP" },
  SA: { label: "السعودية", currency: "SAR" },
};

export const accountCountrySchema = z.enum(ACCOUNT_COUNTRIES);

export const bankAccountSchema = z.object({
  id: z.string(),
  bankName: z.string().min(1),
  accountName: z.string().min(1),
  accountNumber: z.string().min(1),
  iban: z.string().min(1),
  country: accountCountrySchema,
  currency: z.enum(["EGP", "SAR"]),
  cityId: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

export const BANK_ACCOUNT_INPUT = z.object({
  bankName: z.string().min(2),
  accountName: z.string().min(2),
  accountNumber: z.string().min(4),
  iban: z.string().min(8),
  country: accountCountrySchema,
});
export type BankAccountInput = z.infer<typeof BANK_ACCOUNT_INPUT>;

/**
 * A ledger entry is a single immutable money movement.
 *
 * Entries are never edited or deleted: a correction is a new opposing entry, so
 * the balance is always reproducible from the append-only history.
 */
export const LEDGER_KINDS = ["deposit", "expense"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_META: Record<
  LedgerKind,
  { label: string; tone: string }
> = {
  deposit: { label: "إيداع", tone: "badge-green" },
  expense: { label: "مصروف", tone: "badge-red" },
};

export const ledgerEntrySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  kind: z.enum(LEDGER_KINDS),
  label: z.string().min(1),
  amount: z.number().positive(),
  currency: z.enum(["EGP", "SAR"]),
  occurredAt: z.string(),
  recordedBy: z.string(),
  recordedAt: z.string(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const LEDGER_ENTRY_INPUT = z.object({
  accountId: z.string().min(1),
  kind: z.enum(LEDGER_KINDS),
  label: z.string().min(2),
  amount: z.number().positive(),
  occurredAt: z.string().min(1),
});
export type LedgerEntryInput = z.infer<typeof LEDGER_ENTRY_INPUT>;
