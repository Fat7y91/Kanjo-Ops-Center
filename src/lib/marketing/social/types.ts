import { z } from "zod";

export const SOCIAL_PLATFORMS = [
  "meta",
  "instagram",
  "tiktok",
  "snapchat",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_META: Record<SocialPlatform, string> = {
  meta: "فيسبوك",
  instagram: "إنستغرام",
  tiktok: "تيك توك",
  snapchat: "سناب شات",
};

export const socialMetricRowSchema = z.object({
  id: z.string(),
  platform: z.enum(SOCIAL_PLATFORMS),
  accountId: z.string(),
  accountName: z.string(),
  followers: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  capturedAt: z.string(),
});
export type SocialMetricRow = z.infer<typeof socialMetricRowSchema>;

export type SocialAccount = {
  platform: SocialPlatform;
  accountId: string;
  accountName: string;
  followers: number;
  likes: number;
};

export type SocialSyncResult = {
  platform: SocialPlatform;
  ok: boolean;
  accounts: number;
  error?: string;
};

export const socialAccountSummarySchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  accountId: z.string(),
  accountName: z.string(),
  followers: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  delta: z.number().int(),
  capturedAt: z.string(),
});
export type SocialAccountSummary = z.infer<typeof socialAccountSummarySchema>;

export const socialSummarySchema = z.object({
  followers: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  capturedAt: z.string().nullable(),
  trend: z.array(z.number().int().nonnegative()),
  accounts: z.array(socialAccountSummarySchema),
});
export type SocialSummary = z.infer<typeof socialSummarySchema>;

export const EMPTY_SOCIAL_SUMMARY: SocialSummary = {
  followers: 0,
  likes: 0,
  capturedAt: null,
  trend: [],
  accounts: [],
};
