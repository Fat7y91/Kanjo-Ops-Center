import {
  BI_CHANNEL_PLATFORM,
  type BiExpenseCategory,
  type BiExpenseRow,
  type BiMarketingChannel,
  type BiMarketingRow,
} from "./types";
import type { BankAccount, LedgerEntry } from "@/lib/accounts/types";
import type { MarketingCampaign, MarketingEntry } from "@/lib/marketing/types";

/**
 * Turns durable finance and marketing rows into the denormalized shapes the BI
 * widgets consume.
 *
 * There is no synthetic data here: every expense is a real ledger movement and
 * every marketing row is a real campaign entry. Two facts the dashboard wants
 * are not stored and are therefore reported as zero rather than invented:
 * `reach` (the ledger records impressions, not unique reach) and a per-expense
 * city (a bank account carries the city, an entry does not).
 */

const SALARY = /راتب|رواتب|salary|payroll|مكافآت/i;
const MARKETING = /تسويق|حمل|إعلان|اعلان|marketing|campaign|ads/i;
const FIELD = /ميدان|انتقال|بدل|field|transport|visit/i;

/** Conservative label classifier: an unmatched expense is logistics. */
export function expenseCategory(label: string): BiExpenseCategory {
  if (SALARY.test(label)) return "salaries";
  if (MARKETING.test(label)) return "marketing";
  if (FIELD.test(label)) return "field";
  return "logistics";
}

export function buildLiveExpenses(
  accounts: readonly BankAccount[],
  entries: readonly LedgerEntry[],
  cityName: (cityId: string | null) => string,
): BiExpenseRow[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return entries
    .filter((entry) => entry.kind === "expense")
    .map((entry) => {
      const account = accountById.get(entry.accountId);
      return {
        id: entry.id,
        label: entry.label,
        category: expenseCategory(entry.label),
        amount: entry.amount,
        incurredAt: entry.occurredAt,
        cityId: account?.cityId ?? "unknown",
        cityName: cityName(account?.cityId ?? null),
        team: "Executive",
      };
    });
}

export function buildLiveMarketing(
  campaigns: readonly MarketingCampaign[],
  entries: readonly MarketingEntry[],
  cityName: (cityId: string | null) => string,
): BiMarketingRow[] {
  const campaignById = new Map(
    campaigns.map((campaign) => [campaign.id, campaign]),
  );

  return entries
    .map((entry) => {
      const campaign = campaignById.get(entry.campaignId);
      if (!campaign) return null;
      const channel: BiMarketingChannel = campaign.channel;
      return {
        id: entry.id,
        channel,
        platform: campaign.platform ?? BI_CHANNEL_PLATFORM[channel],
        campaign: campaign.name,
        impressions: entry.impressions,
        // Unique reach is not captured by the manual entry form.
        reach: 0,
        clicks: entry.clicks,
        leads: entry.leads,
        conversions: entry.conversions,
        spend: entry.spend,
        occurredAt: entry.occurredAt,
        cityId: campaign.cityId ?? "unknown",
        cityName: cityName(campaign.cityId),
        team: "City Operations",
      } satisfies BiMarketingRow;
    })
    .filter((row): row is BiMarketingRow => row !== null);
}
