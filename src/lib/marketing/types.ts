import { z } from "zod";

import { BI_MARKETING_CHANNELS, BI_MARKETING_PLATFORMS } from "@/lib/bi/types";

/**
 * A campaign is the unit of marketing work: it owns a target, a budget, a run
 * window and a status. Daily results hang off it, so spend can always be
 * reconciled against the budget the campaign was approved with.
 */
export const MARKETING_CAMPAIGN_STATUSES = [
  "active",
  "paused",
  "closed",
] as const;
export type MarketingCampaignStatus =
  (typeof MARKETING_CAMPAIGN_STATUSES)[number];

export const MARKETING_CAMPAIGN_STATUS_META: Record<
  MarketingCampaignStatus,
  { label: string; tone: string }
> = {
  active: { label: "نشطة", tone: "badge-green" },
  paused: { label: "موقوفة", tone: "badge-gold" },
  closed: { label: "منتهية", tone: "badge" },
};

export const marketingCampaignSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  platform: z.enum(BI_MARKETING_PLATFORMS),
  channel: z.enum(BI_MARKETING_CHANNELS),
  cityId: z.string().nullable(),
  /** Approved spend ceiling in EGP, minor units. */
  budget: z.number().nonnegative(),
  targetLeads: z.number().int().nonnegative(),
  targetConversions: z.number().int().nonnegative(),
  startsOn: z.string().min(1),
  endsOn: z.string().min(1),
  status: z.enum(MARKETING_CAMPAIGN_STATUSES),
  createdBy: z.string(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
});
export type MarketingCampaign = z.infer<typeof marketingCampaignSchema>;

export const CAMPAIGN_INPUT = z
  .object({
    name: z.string().trim().min(3, "اسم الحملة مطلوب.").max(120),
    platform: z.enum(BI_MARKETING_PLATFORMS),
    channel: z.enum(BI_MARKETING_CHANNELS),
    cityId: z.string().nullable(),
    budget: z.number().nonnegative(),
    targetLeads: z.number().int().nonnegative(),
    targetConversions: z.number().int().nonnegative(),
    startsOn: z.string().min(1, "تاريخ البداية مطلوب."),
    endsOn: z.string().min(1, "تاريخ النهاية مطلوب."),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "تاريخ النهاية يجب ألا يسبق تاريخ البداية.",
    path: ["endsOn"],
  });
export type CampaignInput = z.infer<typeof CAMPAIGN_INPUT>;

export const CAMPAIGN_STATUS_INPUT = z.object({
  status: z.enum(["active", "paused", "closed"]),
});
export type CampaignStatusInput = z.infer<typeof CAMPAIGN_STATUS_INPUT>;

/**
 * One day of campaign results.
 *
 * Append-only: a corrected figure is a new row with a later `recordedAt`, so the
 * spend trail can always be audited back to its entries.
 */
export const marketingEntrySchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  spend: z.number().nonnegative(),
  impressions: z.number().nonnegative(),
  clicks: z.number().nonnegative(),
  leads: z.number().nonnegative(),
  conversions: z.number().nonnegative(),
  occurredAt: z.string().min(1),
  note: z.string(),
  recordedBy: z.string(),
  recordedAt: z.string(),
});
export type MarketingEntry = z.infer<typeof marketingEntrySchema>;

export const MARKETING_ENTRY_INPUT = z.object({
  campaignId: z.string().min(1, "اختر حملة."),
  spend: z.number().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  leads: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  occurredAt: z.string().min(1),
  note: z.string().trim().max(200).optional(),
});
export type MarketingEntryInput = z.infer<typeof MARKETING_ENTRY_INPUT>;

export type CampaignProgress = {
  campaign: MarketingCampaign;
  spend: number;
  spentShare: number;
  leads: number;
  conversions: number;
  daysRun: number;
  daysLeft: number;
};

/** Outbound integration settings for a platform. Secrets are write-only. */
export const platformSettingsSchema = z.object({
  platform: z.enum(BI_MARKETING_PLATFORMS),
  enabled: z.boolean(),
  apiKeyConfigured: z.boolean(),
  webhookUrl: z.string(),
  updatedAt: z.string(),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const PLATFORM_SETTINGS_INPUT = z.object({
  platform: z.enum(BI_MARKETING_PLATFORMS),
  enabled: z.boolean(),
  credentials: z.record(z.string(), z.string()).default({}),
  webhookUrl: z.string(),
});
export type PlatformSettingsInput = z.infer<typeof PLATFORM_SETTINGS_INPUT>;
