import { z } from "zod";

/**
 * Operator profile and payout method domain types.
 *
 * The SQL half lives in `20261102000001_user_profiles_and_capital.sql`. These
 * types mirror it one-to-one, so a shape that the database would reject can
 * never be submitted from the UI. Founder capital lives in `capital.ts`.
 */

/* ── Payout methods ─────────────────────────────────────────────────────── */

export const PAYOUT_METHODS = ["bank_account", "e_wallet", "instapay"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  bank_account: "تحويل بنكي",
  e_wallet: "محفظة إلكترونية",
  instapay: "إنستاباي",
};

/** Egyptian wallet providers, matching the legacy financial profile vocabulary. */
export const WALLET_PROVIDERS = [
  { value: "vodafone", label: "فودافون كاش" },
  { value: "orange", label: "أورانج كاش" },
  { value: "etisalat", label: "اتصالات كاش" },
  { value: "we", label: "وي باي" },
] as const;

export type WalletProvider = (typeof WALLET_PROVIDERS)[number]["value"];

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
};

export const REVIEW_STATUS_TONE: Record<ReviewStatus, string> = {
  pending: "badge-gold",
  approved: "badge-green",
  rejected: "badge-red",
};

/* Egyptian phone numbers: 11 digits starting 01, as the SQL check requires. */
const EG_PHONE = /^01[0125][0-9]{8}$/;
/* Egyptian IBAN: EG plus 27 alphanumerics, stored unspaced and uppercase. */
const EG_IBAN = /^EG[0-9]{27}$/;

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

export const payoutMethodInputSchema = z
  .discriminatedUnion("method", [
    z.object({
      method: z.literal("bank_account"),
      bankName: z.string().trim().min(2, "اسم البنك مطلوب.").max(80),
      accountHolder: z
        .string()
        .trim()
        .min(8, "اسم صاحب الحساب رباعياً مطلوب.")
        .max(120),
      accountNumber: z.string().trim().min(4, "رقم الحساب مطلوب.").max(34),
      iban: z
        .string()
        .trim()
        .transform((value) => value.replace(/\s/g, "").toUpperCase())
        .pipe(
          z
            .string()
            .regex(EG_IBAN, "رقم الآيبان يجب أن يبدأ بـ EG ويتكون من 29 خانة."),
        ),
    }),
    z.object({
      method: z.literal("e_wallet"),
      walletProvider: z.enum(
        WALLET_PROVIDERS.map((item) => item.value) as [
          WalletProvider,
          ...WalletProvider[],
        ],
        { message: "اختر المحفظة الإلكترونية." },
      ),
      walletPhone: z
        .string()
        .trim()
        .regex(EG_PHONE, "رقم المحفظة يجب أن يبدأ بـ 01 ويتكون من 11 رقماً."),
    }),
    z.object({
      method: z.literal("instapay"),
      instapayType: z.enum(["ipa", "phone"], {
        message: "اختر نوع بيانات إنستاباي.",
      }),
      instapayValue: z.string().trim().min(3, "أدخل قيمة إنستاباي.").max(80),
    }),
  ])
  .superRefine((value, ctx) => {
    // A phone-based InstaPay address carries the same shape a wallet phone
    // does; a payment address (IPA) is a handle, so it is only length-checked.
    if (
      value.method === "instapay" &&
      value.instapayType === "phone" &&
      !EG_PHONE.test(value.instapayValue)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["instapayValue"],
        message: "رقم الهاتف المربوط بإنستاباي يجب أن يبدأ بـ 01.",
      });
    }
  });

export type PayoutMethodInput = z.infer<typeof payoutMethodInputSchema>;

export type PayoutMethodRecord = {
  id: string;
  userId: string;
  method: PayoutMethod;
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  iban: string | null;
  walletProvider: string | null;
  walletPhone: string | null;
  instapayType: string | null;
  instapayValue: string | null;
  status: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

/** One-line summary of a saved destination, for review tables. */
export function payoutDestinationLabel(
  record: PayoutMethodRecord,
): string {
  switch (record.method) {
    case "bank_account":
      return [record.bankName, record.iban].filter(Boolean).join(" · ");
    case "e_wallet": {
      const provider = WALLET_PROVIDERS.find(
        (item) => item.value === record.walletProvider,
      );
      return [provider?.label ?? record.walletProvider, record.walletPhone]
        .filter(Boolean)
        .join(" · ");
    }
    case "instapay":
      return [record.instapayType === "phone" ? "هاتف" : "IPA", record.instapayValue]
        .filter(Boolean)
        .join(" · ");
  }
}

/* ── Profile update ─────────────────────────────────────────────────────── */

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2, "الاسم مطلوب.").max(80),
  email: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(z.string().email("أدخل بريداً إلكترونياً صالحاً.").max(120).nullable()),
  avatarUrl: optionalText.pipe(
    z
      .string()
      .url("رابط الصورة غير صالح.")
      .startsWith("https://", "يجب أن يكون رابط الصورة آمناً.")
      .max(2048)
      .nullable(),
  ),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "أدخل كلمة المرور الحالية."),
    newPassword: z
      .string()
      .min(8, "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.")
      .max(72, "كلمة المرور الجديدة يجب ألا تتجاوز 72 حرفاً."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "كلمتا المرور غير متطابقتين.",
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "اختر كلمة مرور مختلفة عن الحالية.",
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
