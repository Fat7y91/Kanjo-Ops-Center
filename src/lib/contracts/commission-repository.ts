import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { isContractsDatabaseConfigured } from "./repository";
import { resolveContractCommissionRate } from "./commission";
import type { Contract } from "./types";

/**
 * Commission enrichment for the contract register.
 *
 * The register stores the negotiated rate in three possible places, so the list
 * read is completed here instead of widening the contracts projection: the
 * editor's `commission_base` override wins, then the merchant's agreed rate,
 * then its target rate. The lookup is batched by chunk so a full 500-row
 * register does not build an oversized PostgREST URL.
 */

const CHUNK_SIZE = 100;
const BASE_SECTION = "commission_base";

type MerchantRate = { agreed: number | null; target: number | null };

function chunks<T>(items: T[]): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += CHUNK_SIZE) {
    output.push(items.slice(index, index + CHUNK_SIZE));
  }
  return output;
}

function finiteOrNull(value: unknown): number | null {
  if (value == null) return null;
  const rate = Number(value);
  return Number.isFinite(rate) ? rate : null;
}

function rateFromContent(content: unknown): number | null {
  if (!content || typeof content !== "object" || !("rate" in content)) {
    return null;
  }
  return finiteOrNull((content as { rate?: unknown }).rate);
}

async function loadBaseRates(
  contractIds: string[],
): Promise<Map<string, number>> {
  const client = getSupabaseServerClient();
  const rates = new Map<string, number>();

  for (const chunk of chunks(contractIds)) {
    const { data, error } = await client
      .schema("app")
      .from("contract_section_overrides")
      .select("contract_id,content")
      .eq("section_key", BASE_SECTION)
      .in("contract_id", chunk);
    if (error) {
      // A deployment that has not applied the terms migration has no overrides
      // yet; the merchant fallback below is still meaningful.
      if (isMissingSchemaObject(error)) return rates;
      throw error;
    }
    for (const row of data ?? []) {
      const rate = rateFromContent((row as { content?: unknown }).content);
      if (rate !== null) {
        rates.set((row as { contract_id: string }).contract_id, rate);
      }
    }
  }
  return rates;
}

async function loadMerchantRates(
  merchantIds: string[],
): Promise<Map<string, MerchantRate>> {
  const client = getSupabaseServerClient();
  const rates = new Map<string, MerchantRate>();

  for (const chunk of chunks(merchantIds)) {
    const { data, error } = await client
      .schema("app")
      .from("merchants")
      .select("id,agreed_commission,target_commission")
      .in("id", chunk);
    if (error) {
      if (isMissingSchemaObject(error)) return rates;
      throw error;
    }
    for (const row of data ?? []) {
      const merchant = row as {
        id: string;
        agreed_commission?: unknown;
        target_commission?: unknown;
      };
      rates.set(merchant.id, {
        agreed: finiteOrNull(merchant.agreed_commission),
        target: finiteOrNull(merchant.target_commission),
      });
    }
  }
  return rates;
}

/** Returns the contracts with `commissionRate` resolved for display. */
export async function attachContractCommissionRates(
  contracts: Contract[],
): Promise<Contract[]> {
  if (!isContractsDatabaseConfigured() || contracts.length === 0) {
    return contracts;
  }

  const contractIds = [...new Set(contracts.map((contract) => contract.id))];
  const merchantIds = [...new Set(contracts.map((contract) => contract.merchantId))];
  const [baseRates, merchantRates] = await Promise.all([
    loadBaseRates(contractIds),
    loadMerchantRates(merchantIds),
  ]);

  return contracts.map((contract) => {
    const merchant = merchantRates.get(contract.merchantId);
    return {
      ...contract,
      commissionRate: resolveContractCommissionRate(
        baseRates.get(contract.id),
        merchant?.agreed,
        merchant?.target,
      ),
    };
  });
}
