import { z } from "zod";

/**
 * Contract register domain types.
 *
 * A contract moves draft → pending_signature → signed, or is cancelled from
 * either open state. `signed` and `cancelled` are terminal: an executed deal is
 * never reworded, and SQL enforces the same rule.
 */
export const CONTRACT_STATUSES = [
  "draft",
  "pending_signature",
  "signed",
  "cancelled",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_META: Record<
  ContractStatus,
  { label: string; tone: string }
> = {
  draft: { label: "مسودة", tone: "" },
  pending_signature: { label: "يتطلب توقيعاً", tone: "badge-gold" },
  signed: { label: "موقّع", tone: "badge-green" },
  cancelled: { label: "ملغى", tone: "badge-red" },
};

export const contractSchema = z.object({
  id: z.string(),
  reference: z.string().min(1),
  merchantId: z.string().min(1),
  merchantName: z.string(),
  cityId: z.string().nullable(),
  value: z.number().nonnegative(),
  currency: z.enum(["EGP", "SAR"]),
  status: z.enum(CONTRACT_STATUSES),
  signatory: z.string(),
  body: z.string(),
  signedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Contract = z.infer<typeof contractSchema>;

export const CONTRACT_DRAFT_INPUT = z.object({
  merchantId: z.string().trim().min(1, "اختر تاجراً."),
  merchantName: z.string().trim().default(""),
  cityId: z.string().nullable().default(null),
  value: z.number().nonnegative(),
  currency: z.enum(["EGP", "SAR"]).default("EGP"),
  signatory: z.string().trim().max(120).default(""),
  body: z.string().trim().max(4000).default(""),
});
export type ContractDraftInput = z.infer<typeof CONTRACT_DRAFT_INPUT>;

export const CONTRACT_EDIT_INPUT = CONTRACT_DRAFT_INPUT.partial().extend({
  signatory: z.string().trim().max(120).optional(),
  body: z.string().trim().max(4000).optional(),
});
export type ContractEditInput = z.infer<typeof CONTRACT_EDIT_INPUT>;

export const CONTRACT_ACTION_INPUT = z.object({
  action: z.enum(["send", "sign", "cancel"]),
  signatory: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});
export type ContractActionInput = z.infer<typeof CONTRACT_ACTION_INPUT>;
