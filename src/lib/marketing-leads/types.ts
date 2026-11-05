import { z } from "zod";

/**
 * Inbound campaign leads (`app.marketing_leads`).
 *
 * These are people, not spend: a Spinwheel entry, a landing-page signup or a
 * referral. They are deliberately separate from `app.marketing_entries`, which
 * records daily ad cost. The marketing desk triages a lead through the
 * lifecycle below and links it to the campaign that produced it.
 */

export const LEAD_SOURCES = [
  "spinwheel",
  "landing",
  "referral",
  "import",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_META: Record<LeadSource, string> = {
  spinwheel: "عجلة الحظ",
  landing: "صفحة الهبوط",
  referral: "إحالة",
  import: "استيراد",
};

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "rejected",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; tone: string }
> = {
  new: { label: "جديد", tone: "badge-gold" },
  contacted: { label: "تم التواصل", tone: "" },
  qualified: { label: "مؤهل", tone: "badge-blue" },
  converted: { label: "تحوّل لعميل", tone: "badge-green" },
  rejected: { label: "مرفوض", tone: "badge-red" },
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === "string" &&
    (LEAD_STATUSES as readonly string[]).includes(value)
  );
}

export function leadStatusMeta(status: string): { label: string; tone: string } {
  return isLeadStatus(status)
    ? LEAD_STATUS_META[status]
    : { label: status, tone: "" };
}

export type MarketingLead = {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  cityId: string | null;
  phoneNumber: string;
  promoCode: string;
  userGuess: string;
  prizeDetails: string;
  source: LeadSource;
  status: LeadStatus;
  notes: string;
  occurredAt: string;
  createdAt: string;
};

const phoneDigits = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .regex(/^[0-9]{8,15}$/, "رقم الهاتف يجب أن يتكون من 8 إلى 15 رقماً."),
  );

/** Public intake (spinwheel / landing). No status: the queue owns triage. */
export const publicLeadInputSchema = z.object({
  phoneNumber: phoneDigits,
  promoCode: z.string().trim().max(40).default(""),
  userGuess: z.string().trim().max(120).default(""),
  prizeDetails: z.string().trim().max(200).default(""),
  campaignId: z.string().uuid().nullable().default(null),
  cityId: z.string().trim().max(120).nullable().default(null),
  source: z.enum(LEAD_SOURCES).default("spinwheel"),
});

export type PublicLeadInput = z.infer<typeof publicLeadInputSchema>;

/** Desk triage: status and notes only. */
export const leadStatusPatchSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    notes: z.string().trim().max(1000).optional(),
    campaignId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.notes !== undefined ||
      value.campaignId !== undefined,
    { message: "لا يوجد تغيير مطلوب." },
  );

export type LeadStatusPatch = z.infer<typeof leadStatusPatchSchema>;
