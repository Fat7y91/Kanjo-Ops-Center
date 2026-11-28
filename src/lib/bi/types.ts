import { z } from "zod";

import { BI_MARKETING_CHANNELS, BI_MARKETING_PLATFORMS } from "./filters";

export * from "./filters";

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
  /** Merchant-level publish flag from `app.merchant_v1_profiles`. */
  appPublished: z.boolean(),
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

export const biOrderMetricRowSchema = z.object({
  /** Operating day, `YYYY-MM-DD`. */
  date: z.string(),
  /** Timestamp of the latest order in the bucket. */
  occurredAt: z.string(),
  /** Kanjo operating day resolved from the delivery/occurrence timestamp. */
  businessDay: z.string(),
  merchantId: z.string(),
  merchantName: z.string(),
  cityId: z.string().nullable(),
  courierId: z.string(),
  courierName: z.string(),
  /** Internal partner: payable may be excluded from settlement and P&L. */
  isInternalStaff: z.boolean().default(false),
  couponCode: z.string(),
  currency: z.enum(["EGP", "SAR"]),
  orders: z.number().int().nonnegative(),
  volume: z.number(),
  deliveryFee: z.number(),
  /** Generic order discount (imported `discount_amount`). */
  orderDiscount: z.number().default(0),
  /** Free-shipping discount funded by the platform. */
  shippingDiscount: z.number().default(0),
  commission: z.number(),
  courierCut: z.number(),
  couponDiscount: z.number(),
  rewardDiscount: z.number().default(0),
  platformFunded: z.number(),
  vendorFunded: z.number(),
  walletDiscount: z.number(),
});
export type BiOrderMetricRow = z.infer<typeof biOrderMetricRowSchema>;

/**
 * One posted expense / revenue leg the Net Profit row deducts.
 *
 * The orders widget already nets the per-order courier cut and coupon expense
 * off its own profit, so the ledger is read again only for the fixed costs that
 * sit below the order line: the attendance base, manual bonuses and other
 * operating expenses. Facts stay raw (one per journal line) so the dashboard can
 * filter by day, courier and city before summing.
 */
export const biOperatingCostFactSchema = z.object({
  /** Operating day, `YYYY-MM-DD`, from the journal entry date. */
  day: z.string(),
  /** Account code, e.g. `5100` (courier pay) or `5110` (courier bonuses). */
  code: z.string(),
  sourceType: z.string(),
  sourceId: z.string().nullable(),
  partyType: z.enum(["merchant", "courier", "bank", "customer"]).nullable(),
  partyId: z.string().nullable(),
  debitMinor: z.number().int(),
  creditMinor: z.number().int(),
});
export type BiOperatingCostFact = z.infer<typeof biOperatingCostFactSchema>;

/**
 * Party-account totals from the double-entry clearinghouse.
 *
 * Receivables are positive party balances (the party owes Kanjo); payables are
 * negative balances (Kanjo owes the party). These are book positions, not a
 * period flow, so the dashboard never applies the date filter to them.
 */
export const biPartyBalanceSchema = z.object({
  currency: z.enum(["EGP", "SAR"]),
  receivables: z.number().nonnegative(),
  payables: z.number().nonnegative(),
  /** Cash already received from posted merchant settlements. */
  collected: z.number().nonnegative().default(0),
});
export type BiPartyBalance = z.infer<typeof biPartyBalanceSchema>;

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
  orders: z.array(biOrderMetricRowSchema),
  /** Posted expense/revenue legs below the order line, for the Net Profit row. */
  operatingCosts: z.array(biOperatingCostFactSchema),
  /** Absolute clearinghouse positions; never narrowed by the filter bar. */
  partyBalances: z.array(biPartyBalanceSchema),
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
