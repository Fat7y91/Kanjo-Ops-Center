import type { BiDataset, BiMarketingChannel } from "./types";
import { sum } from "./aggregate";

export type MarketingSummary = {
  reach: number;
  impressions: number;
  leads: number;
  conversions: number;
  spend: number;
  costPerLead: number;
  conversionRate: number;
  byChannel: Array<{
    channel: BiMarketingChannel;
    reach: number;
    leads: number;
    spend: number;
  }>;
};

export function buildMarketing(
  rows: BiDataset["marketing"],
): MarketingSummary {
  const reach = sum(rows.map((row) => row.reach));
  const leads = sum(rows.map((row) => row.leads));
  const spend = sum(rows.map((row) => row.spend));
  const conversions = sum(rows.map((row) => row.conversions));

  const channelMap = new Map<
    BiMarketingChannel,
    { reach: number; leads: number; spend: number }
  >();
  for (const row of rows) {
    const current = channelMap.get(row.channel) ?? {
      reach: 0,
      leads: 0,
      spend: 0,
    };
    channelMap.set(row.channel, {
      reach: current.reach + row.reach,
      leads: current.leads + row.leads,
      spend: current.spend + row.spend,
    });
  }

  return {
    reach,
    impressions: sum(rows.map((row) => row.impressions)),
    leads,
    conversions,
    spend,
    costPerLead: leads === 0 ? 0 : Math.round(spend / leads),
    conversionRate: leads === 0 ? 0 : conversions / leads,
    byChannel: Array.from(channelMap.entries()).map(([channel, value]) => ({
      channel,
      ...value,
    })),
  };
}
