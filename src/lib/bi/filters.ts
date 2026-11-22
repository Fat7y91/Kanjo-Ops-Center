import { z } from "zod";

/** Filter windows offered by the universal filter bar. */
export const BI_RANGES = [
  "business_day",
  "7d",
  "month",
  "30d",
  "90d",
  "ytd",
  "custom",
  "all",
] as const;
export type BiRange = (typeof BI_RANGES)[number];

export const BI_RANGE_LABELS: Record<BiRange, string> = {
  business_day: "اليوم التشغيلي",
  "7d": "آخر 7 أيام",
  month: "هذا الشهر",
  "30d": "آخر 30 يوماً",
  "90d": "آخر 90 يوماً",
  ytd: "منذ بداية العام",
  custom: "فترة مخصصة (باليوم والساعة)",
  all: "كل الفترات",
};

export const BI_MARKETING_CHANNELS = [
  "instagram",
  "tiktok",
  "google",
  "referral",
  "field",
] as const;
export type BiMarketingChannel = (typeof BI_MARKETING_CHANNELS)[number];

export const BI_MARKETING_META: Record<BiMarketingChannel, string> = {
  instagram: "إنستجرام",
  tiktok: "تيك توك",
  google: "إعلانات جوجل",
  referral: "إحالات",
  field: "تسويق ميداني",
};

/**
 * Ad platform, one level above the channel.
 *
 * A channel is where the audience sees us; a platform is the network that bills
 * us for it. Splitting them lets one platform run several channels without
 * duplicating spend.
 */
export const BI_MARKETING_PLATFORMS = [
  "meta",
  "tiktok",
  "google",
  "snapchat",
  "offline",
] as const;
export type BiMarketingPlatform = (typeof BI_MARKETING_PLATFORMS)[number];

export const BI_MARKETING_PLATFORM_META: Record<BiMarketingPlatform, string> = {
  meta: "ميتا",
  tiktok: "تيك توك",
  google: "جوجل",
  snapchat: "سناب شات",
  offline: "مباشر",
};

export const BI_CHANNEL_PLATFORM: Record<
  BiMarketingChannel,
  BiMarketingPlatform
> = {
  instagram: "meta",
  tiktok: "tiktok",
  google: "google",
  referral: "offline",
  field: "offline",
};


export const biFiltersSchema = z.object({
  range: z.enum(BI_RANGES),
  cityId: z.string().nullable(),
  team: z.string().nullable(),
  /** Assigned field rep ("courier") who owns the merchant relationship. */
  repId: z.string().nullable(),
  /** Central taxonomy vendor type, so the dashboard can slice by category. */
  vendorTypeId: z.number().int().nullable(),
  /** Custom window start, Cairo wall clock (`YYYY-MM-DDTHH:mm`). */
  from: z.string().default(""),
  /** Custom window end, Cairo wall clock (`YYYY-MM-DDTHH:mm`). */
  to: z.string().default(""),
});
export type BiFilters = z.infer<typeof biFiltersSchema>;

export const DEFAULT_BI_FILTERS: BiFilters = {
  range: "all",
  cityId: null,
  team: null,
  repId: null,
  vendorTypeId: null,
  from: "",
  to: "",
};
