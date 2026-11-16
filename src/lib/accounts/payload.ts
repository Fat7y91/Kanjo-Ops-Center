import { z } from "zod";

import {
  bankAccountSchema,
  expenseCategorySchema,
  ledgerEntrySchema,
} from "./types";

/**
 * Wire contract for `GET /api/accounts`.
 *
 * The treasury screen renders balances and totals, so the payload is validated
 * down to the entry: a malformed amount would otherwise be formatted into a
 * currency string and read as a real balance. The schemas are the ones the
 * domain already uses for storage, so a column that changes shape fails at the
 * boundary instead of inside the ledger.
 */

export const ledgerTotalsSchema = z.object({
  deposits: z.number(),
  expenses: z.number(),
  balance: z.number(),
});

export const accountSummarySchema = z.object({
  account: bankAccountSchema,
  deposits: z.number(),
  expenses: z.number(),
  balance: z.number(),
  entryCount: z.number(),
});

/**
 * The access flags travel with the numbers because the screen decides from them
 * what to draw — and drawing a balance the viewer was not granted would be a
 * disclosure, not a rendering bug. They are repeated from the session the
 * request was authorized with, so the client never infers access itself.
 */
export const accountsPayloadSchema = z.object({
  accounts: z.array(accountSummarySchema),
  entries: z.array(ledgerEntrySchema),
  /** Analytical buckets the expense form requires. */
  expenseCategories: z.array(expenseCategorySchema).default([]),
  totals: z.object({ EGP: ledgerTotalsSchema, SAR: ledgerTotalsSchema }),
  full: z.boolean(),
  canViewTransactions: z.boolean(),
  canRecordDeposits: z.boolean(),
  canRecordExpenses: z.boolean(),
  /** May post deposits/expenses directly to the Saudi bank ledger. */
  canOperateSar: z.boolean().default(false),
  canAddAccount: z.boolean(),
  /** May post a manual SAR→EGP transfer between the two bank ledgers. */
  canTransferFx: z.boolean(),
  /** May create or rename the analytical expense buckets. */
  canManageCategories: z.boolean().default(false),
});

export type AccountsPayload = z.infer<typeof accountsPayloadSchema>;
