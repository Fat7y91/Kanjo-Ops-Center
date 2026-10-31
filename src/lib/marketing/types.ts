import { z } from "zod";

import { BI_MARKETING_PLATFORMS } from "@/lib/bi/types";

/**
 * A manual marketing fact entered by the team.
 *
 * Rows are append-only: a corrected figure is a new row with a later
 * `recordedAt`, so the aggregate can always be audited back to its entries.
 */
export const marketingEntrySchema = z.object({
  id: z.string(),
  platform: z.enum(BI_MARKETING_PLATFORMS),
  campaign: z.string().min(1),
  cityId: z.string().nullable(),
  spend: z.number().nonnegative(),
  impressions: z.number().nonnegative(),
  clicks: z.number().nonnegative(),
  conversions: z.number().nonnegative(),
  occurredAt: z.string().min(1),
  recordedBy: z.string(),
  recordedAt: z.string(),
});
export type MarketingEntry = z.infer<typeof marketingEntrySchema>;

export const MARKETING_ENTRY_INPUT = z.object({
  platform: z.enum(BI_MARKETING_PLATFORMS),
  campaign: z.string().min(2),
  cityId: z.string().nullable(),
  spend: z.number().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  occurredAt: z.string().min(1),
});
export type MarketingEntryInput = z.infer<typeof MARKETING_ENTRY_INPUT>;

/** Outbound integration settings for a platform. Secrets are write-only. */
export const platformSettingsSchema = z.object({
  platform: z.enum(BI_MARKETING_PLATFORMS),
  enabled: z.boolean(),
  /** Masked on read; the raw value never leaves the server. */
  apiKeyConfigured: z.boolean(),
  webhookUrl: z.string(),
  updatedAt: z.string(),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const PLATFORM_SETTINGS_INPUT = z.object({
  platform: z.enum(BI_MARKETING_PLATFORMS),
  apiKey: z.string().optional(),
  webhookUrl: z.string(),
  enabled: z.boolean(),
});
export type PlatformSettingsInput = z.infer<typeof PLATFORM_SETTINGS_INPUT>;
