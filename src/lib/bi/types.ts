import { z } from "zod";

/** Filter windows offered by the universal filter bar. */
export const BI_RANGES = ["30d", "90d", "ytd", "all"] as const;
export type BiRange = (typeof BI_RANGES)[number];

export const BI_RANGE_LABELS: Record<BiRange, string> = {
  "30d": "آخر 30 يوماً",
  "90d": "آخر 90 يوماً",
  ytd: "منذ بداية العام",
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
  /** Ad platform, one level above channel. */
  platform: z.enum(BI_MARKETING_PLATFORMS).nullable(),
});
export type BiFilters = z.infer<typeof biFiltersSchema>;

export const DEFAULT_BI_FILTERS: BiFilters = {
  range: "90d",
  cityId: null,
  team: null,
  repId: null,
  vendorTypeId: null,
  platform: null,
};

/** Merchant lifecycle funnel, in presentation order. */
export const BI_DEAL_STAGES = [
  "visited",
  "no_contract",
  "provisional",
  "final",
  "signed",
] as const;
export type BiDealStage = (typeof BI_DEAL_STAGES)[number];

export const BI_DEAL_STAGE_META: Record<
  BiDealStage,
  { label: string; tone: string }
> = {
  visited: { label: "تمت الزيارة", tone: "stage-visited" },
  no_contract: { label: "بدون اتفاق", tone: "stage-none" },
  provisional: { label: "اتفاق مبدئي", tone: "stage-provisional" },
  final: { label: "اتفاق نهائي", tone: "stage-final" },
  signed: { label: "توقيع العقد", tone: "stage-signed" },
};

export const BI_DOCUMENT_KEYS = ["cr", "tax", "menu"] as const;
export type BiDocumentKey = (typeof BI_DOCUMENT_KEYS)[number];

export const BI_DOCUMENT_META: Record<
  BiDocumentKey,
  { label: string; color: string }
> = {
  cr: { label: "السجل التجاري", color: "#2ca36a" },
  tax: { label: "البطاقة الضريبية", color: "#7c3aed" },
  menu: { label: "قائمة المنتجات", color: "#d4a017" },
};

export const biDocumentsSchema = z.object({
  cr: z.boolean(),
  tax: z.boolean(),
  menu: z.boolean(),
});
export type BiDocuments = z.infer<typeof biDocumentsSchema>;

export const biMerchantRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  cityId: z.string(),
  cityName: z.string(),
  team: z.string(),
  repId: z.string().nullable(),
  repName: z.string().nullable(),
  vendorTypeId: z.number().nullable(),
  vendorType: z.string(),
  stage: z.enum(BI_DEAL_STAGES),
  monthlyValue: z.number().nonnegative(),
  targetCommission: z.number().min(0).max(100),
  achievedCommission: z.number().min(0).max(100),
  collected: z.number().nonnegative(),
  documents: biDocumentsSchema,
  visitedAt: z.string().nullable(),
  lastVisitAt: z.string().nullable(),
});
export type BiMerchantRow = z.infer<typeof biMerchantRowSchema>;

export const BI_EXPENSE_CATEGORIES = [
  "field",
  "salaries",
  "marketing",
  "logistics",
] as const;
export type BiExpenseCategory = (typeof BI_EXPENSE_CATEGORIES)[number];

export const BI_EXPENSE_META: Record<BiExpenseCategory, string> = {
  field: "مصروفات ميدانية",
  salaries: "رواتب",
  marketing: "تسويق",
  logistics: "لوجستيات",
};

export const biExpenseRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(BI_EXPENSE_CATEGORIES),
  amount: z.number().nonnegative(),
  incurredAt: z.string(),
  cityId: z.string(),
  cityName: z.string(),
  team: z.string(),
});
export type BiExpenseRow = z.infer<typeof biExpenseRowSchema>;

export const biMarketingRowSchema = z.object({
  id: z.string(),
  channel: z.enum(BI_MARKETING_CHANNELS),
  platform: z.enum(BI_MARKETING_PLATFORMS),
  campaign: z.string(),
  impressions: z.number().nonnegative(),
  reach: z.number().nonnegative(),
  clicks: z.number().nonnegative(),
  leads: z.number().nonnegative(),
  conversions: z.number().nonnegative(),
  spend: z.number().nonnegative(),
  occurredAt: z.string(),
  cityId: z.string(),
  cityName: z.string(),
  team: z.string(),
});
export type BiMarketingRow = z.infer<typeof biMarketingRowSchema>;

export const BI_CATALOG_STATES = ["published", "missing"] as const;
export type BiCatalogState = (typeof BI_CATALOG_STATES)[number];

export const BI_CATALOG_META: Record<
  BiCatalogState,
  { label: string; tone: string }
> = {
  published: { label: "منشور", tone: "badge-green" },
  missing: { label: "غير مسجّل", tone: "badge-red" },
};

export const biCatalogRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  merchantId: z.string(),
  merchantName: z.string(),
  cityId: z.string(),
  cityName: z.string(),
  team: z.string(),
  state: z.enum(BI_CATALOG_STATES),
  price: z.number().nonnegative(),
  updatedAt: z.string(),
});
export type BiCatalogRow = z.infer<typeof biCatalogRowSchema>;

export const biCityOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type BiCityOption = z.infer<typeof biCityOptionSchema>;

/**
 * Raw BI facts. Everything the dashboard renders is derived from this payload,
 * so filtering stays instant and the drill-down tables always match the card
 * that opened them.
 */
export const biAccountRowSchema = z.object({
  id: z.string(),
  bankName: z.string(),
  iban: z.string(),
  currency: z.enum(["EGP", "SAR"]),
  deposits: z.number(),
  expenses: z.number(),
  balance: z.number(),
});
export type BiAccountRow = z.infer<typeof biAccountRowSchema>;

export const biLedgerRowSchema = z.object({
  id: z.string(),
  bankName: z.string(),
  label: z.string(),
  amount: z.number(),
  currency: z.enum(["EGP", "SAR"]),
  occurredAt: z.string(),
});
export type BiLedgerRow = z.infer<typeof biLedgerRowSchema>;

export const biPayslipRowSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  title: z.string(),
  gross: z.number(),
  deductions: z.number(),
  net: z.number(),
});
export type BiPayslipRow = z.infer<typeof biPayslipRowSchema>;

export const biTreasurySchema = z.object({
  currency: z.enum(["EGP", "SAR"]),
  deposits: z.number(),
  expenses: z.number(),
  balance: z.number(),
  pendingPayroll: z.number().nonnegative(),
});
export type BiTreasury = z.infer<typeof biTreasurySchema>;

export const biDatasetSchema = z.object({
  generatedAt: z.string(),
  cities: z.array(biCityOptionSchema),
  teams: z.array(z.string()),
  reps: z.array(z.object({ id: z.string(), name: z.string() })),
  vendorTypes: z.array(
    z.object({ id: z.number(), name: z.string() }),
  ),
  merchants: z.array(biMerchantRowSchema),
  expenses: z.array(biExpenseRowSchema),
  marketing: z.array(biMarketingRowSchema),
  catalog: z.array(biCatalogRowSchema),
  /**
   * Treasury position, computed on the server and shipped with the payload so
   * the dashboard client never imports the accounts or payroll stores. Client
   * imports of server stores would create a second, divergent copy of the
   * ledger in the browser bundle.
   */
  treasury: z.array(biTreasurySchema),
  accounts: z.array(biAccountRowSchema),
  ledger: z.array(biLedgerRowSchema),
  payslips: z.array(biPayslipRowSchema),
});
export type BiDataset = z.infer<typeof biDatasetSchema>;

export const BI_COLUMN_TYPES = [
  "text",
  "currency",
  "number",
  "percent",
  "date",
  "status",
] as const;
export type BiColumnType = (typeof BI_COLUMN_TYPES)[number];

export type BiColumn = {
  key: string;
  label: string;
  type?: BiColumnType;
  align?: "start" | "end";
};

export type BiCell = string | number | boolean | null;
export type BiRow = Record<string, BiCell>;

export type BiTable = {
  id: string;
  title: string;
  description?: string;
  columns: BiColumn[];
  rows: BiRow[];
};
