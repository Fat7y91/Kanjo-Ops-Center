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
  serialNumber: z.number().int().nonnegative().nullable(),
  merchantId: z.string().min(1),
  merchantName: z.string(),
  cityId: z.string().nullable(),
  value: z.number().nonnegative(),
  currency: z.enum(["EGP", "SAR"]),
  status: z.enum(CONTRACT_STATUSES),
  signatory: z.string(),
  body: z.string(),
  storagePath: z.string().nullable(),
  sha256: z.string().nullable(),
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
  currency: z.enum(["EGP", "SAR"]).default("EGP"),
  signatory: z.string().trim().max(120).default(""),
  // Clause text is unbounded here: the rendered contract can be long and the
  // database column is `text`. Length is a document concern, not an input rule.
  body: z.string().trim().default(""),
});
export type ContractDraftInput = z.infer<typeof CONTRACT_DRAFT_INPUT>;

export const CONTRACT_EDIT_INPUT = CONTRACT_DRAFT_INPUT.partial().extend({
  signatory: z.string().trim().max(120).optional(),
  body: z.string().trim().optional(),
});
export type ContractEditInput = z.infer<typeof CONTRACT_EDIT_INPUT>;

/* ── Clauses and commission lines ────────────────────────────────────────── */

export const CONTRACT_CLAUSE_SCOPES = ["contract", "vendor_type", "merchant"] as const;
export type ContractClauseScope = (typeof CONTRACT_CLAUSE_SCOPES)[number];

export const contractClauseSchema = z.object({
  id: z.string(),
  contractId: z.string().nullable(),
  scope: z.enum(CONTRACT_CLAUSE_SCOPES),
  vendorTypeId: z.string().nullable(),
  merchantId: z.string().nullable(),
  ordinal: z.number().int().nonnegative(),
  titleAr: z.string(),
  bodyAr: z.string(),
  active: z.boolean(),
});
export type ContractClause = z.infer<typeof contractClauseSchema>;

export const CONTRACT_CLAUSE_INPUT = z.object({
  scope: z.enum(CONTRACT_CLAUSE_SCOPES).default("contract"),
  vendorTypeId: z.string().trim().nullable().default(null),
  merchantId: z.string().trim().nullable().default(null),
  ordinal: z.number().int().nonnegative().default(0),
  titleAr: z.string().trim().default(""),
  bodyAr: z.string().default(""),
  active: z.boolean().default(true),
});
export type ContractClauseInput = z.infer<typeof CONTRACT_CLAUSE_INPUT>;

export const contractCommissionLineSchema = z.object({
  id: z.string(),
  contractId: z.string(),
  categoryName: z.string(),
  commissionRate: z.number().nonnegative(),
});
export type ContractCommissionLine = z.infer<typeof contractCommissionLineSchema>;

export const CONTRACT_COMMISSION_LINE_INPUT = z.object({
  categoryName: z.string().trim().min(1, "اسم التصنيف مطلوب."),
  commissionRate: z.number().nonnegative().max(100, "النسبة يجب ألا تتجاوز 100."),
});
export type ContractCommissionLineInput = z.infer<
  typeof CONTRACT_COMMISSION_LINE_INPUT
>;

export const CONTRACT_ACTION_INPUT = z.object({
  action: z.enum(["send", "sign", "cancel"]),
  signatory: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});
export type ContractActionInput = z.infer<typeof CONTRACT_ACTION_INPUT>;
