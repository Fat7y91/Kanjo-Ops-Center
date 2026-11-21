import { z } from "zod";

/**
 * Payout destination for a delivery partner.
 *
 * The roster stores `payout_preferences` as JSONB. The shape is a discriminated
 * union keyed by `method`, so a row can describe exactly one destination and
 * never leave the payer guessing which fields are live. It mirrors the payout
 * methods the treasury already understands: bank account, mobile wallet,
 * InstaPay and Egypt Post.
 */

export const PAYOUT_METHODS = [
  "bank_account",
  "e_wallet",
  "instapay",
  "egypt_post",
] as const;

export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  bank_account: "حساب بنكي",
  e_wallet: "محفظة إلكترونية",
  instapay: "إنستاباي",
  egypt_post: "البريد المصري",
};

const trimmed = (max: number) => z.string().trim().max(max);

const phoneField = trimmed(20).regex(/^01[0125][0-9]{8}$/, "أدخل رقم محفظة مصرياً صحيحاً.");

export const payoutPreferencesSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("bank_account"),
    bankName: trimmed(80).min(1, "اسم البنك مطلوب."),
    accountHolder: trimmed(80).min(1, "اسم صاحب الحساب مطلوب."),
    accountNumber: trimmed(40).min(1, "رقم الحساب مطلوب."),
    iban: trimmed(34).default(""),
  }),
  z.object({
    method: z.literal("e_wallet"),
    provider: trimmed(60).min(1, "اسم مزوّد المحفظة مطلوب."),
    walletPhone: phoneField,
  }),
  z.object({
    method: z.literal("instapay"),
    instapayValue: trimmed(80).min(1, "عنوان إنستاباي مطلوب."),
  }),
  z.object({
    method: z.literal("egypt_post"),
    postOffice: trimmed(80).min(1, "مكتب البريد مطلوب."),
    beneficiaryName: trimmed(80).min(1, "اسم المستفيد مطلوب."),
  }),
]);

export type PayoutPreferences = z.infer<typeof payoutPreferencesSchema>;

/** A default destination so the form always has a valid object to edit. */
export const EMPTY_PAYOUT: PayoutPreferences = {
  method: "bank_account",
  bankName: "",
  accountHolder: "",
  accountNumber: "",
  iban: "",
};

/**
 * Turns arbitrary JSONB back into a typed destination. Anything that does not
 * match the current shape degrades to `null` instead of throwing inside a
 * client component, so a legacy or hand-edited row can never break the screen.
 */
export function parsePayoutPreferences(value: unknown): PayoutPreferences | null {
  const result = payoutPreferencesSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** One-line, method-aware summary for the directory and the details modal. */
export function payoutSummary(value: PayoutPreferences | null): string {
  if (!value) return "—";
  switch (value.method) {
    case "bank_account":
      return value.iban
        ? `${value.bankName} · ${value.iban}`
        : `${value.bankName} · ${value.accountNumber}`;
    case "e_wallet":
      return `${value.provider} · ${value.walletPhone}`;
    case "instapay":
      return `${PAYOUT_METHOD_LABEL.instapay} · ${value.instapayValue}`;
    case "egypt_post":
      return `${value.postOffice} · ${value.beneficiaryName}`;
  }
}
