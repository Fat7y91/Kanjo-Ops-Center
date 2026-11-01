import { z } from "zod";

/**
 * Founder capital domain types.
 *
 * Capital is entered in major units on the form and stored in minor units on
 * the row, the same unit the immutable treasury ledger uses.
 */

/* ── Founder capital ────────────────────────────────────────────────────── */

/**
 * Capital is entered in major units like every other money form, then stored
 * in minor units. `Number.NaN` for an empty value keeps a cleared field from
 * silently saving a zero deposit.
 */
const capitalAmount = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined
      ? Number.NaN
      : Number(value),
  z
    .number({ message: "المبلغ يجب أن يكون رقماً." })
    .finite({ message: "المبلغ يجب أن يكون رقماً صالحاً." })
    .positive("المبلغ يجب أن يكون أكبر من صفر.")
    .max(999_999_999.99, "المبلغ أكبر من الحد المسموح."),
);

export const capitalDepositInputSchema = z.object({
  amount: capitalAmount,
  currency: z.enum(["EGP", "SAR"], { message: "اختر العملة." }),
  note: z.string().trim().max(280, "الملاحظة طويلة جداً.").default(""),
});

export type CapitalDepositInput = z.infer<typeof capitalDepositInputSchema>;

export const CAPITAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type CapitalStatus = (typeof CAPITAL_STATUSES)[number];

export const CAPITAL_STATUS_LABEL: Record<CapitalStatus, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
};

export type CapitalDeposit = {
  id: string;
  founderId: string;
  founderName: string;
  amount: number;
  currency: "EGP" | "SAR";
  accountId: string | null;
  receiptPath: string | null;
  note: string;
  status: CapitalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  ledgerEntryId: string | null;
  createdAt: string;
};

/** Major units → minor units, rounding to the nearest piaster/halala. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}
