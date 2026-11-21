import "server-only";

import { normalizeSearchText } from "@/lib/search/normalize";

import {
  autopilotCategories,
  defaultAutopilotCategoryKey,
  PHARMACY_VENDOR_TYPE_ID,
} from "./categories";
import { enrichPharmacyItems } from "./enrich-pharmacy";
import { callDeepSeekEnrichment, type DeepSeekRequestItem } from "./deepseek";
import { existingImagesByBarcode } from "./existing-images";
import {
  getMasterCatalogItemsByIds,
  searchMasterCatalogProducts,
} from "@/lib/catalog/master-catalog";
import type { MasterCatalogItem } from "@/lib/catalog/master-catalog-search";
import { findWebProductImage } from "./serper";
import type {
  AutopilotEnrichment,
  AutopilotEnrichmentInput,
  AutopilotEnrichResponse,
} from "./types";
import type { DeepSeekEnrichmentResult } from "./deepseek-parse";

export type EnrichResponse = AutopilotEnrichResponse;

function masterImage(item: MasterCatalogItem): string | null {
  if (item.driveFileId) {
    return `https://lh3.googleusercontent.com/d/${item.driveFileId}=w1600`;
  }
  return item.imageUrl || null;
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => run()),
  );
  return results;
}

function exactMasterMatch(
  candidates: MasterCatalogItem[],
  query: string,
): MasterCatalogItem | null {
  const target = normalizeSearchText(query);
  return (
    candidates.find((candidate) => normalizeSearchText(candidate.name) === target) ??
    null
  );
}

/**
 * Runs the three enrichment tiers for up to 25 immutable merchant rows.
 * Name, barcode and price are never rewritten here; the response only carries
 * image/category metadata for the save step.
 *
 * Rows whose barcode already has an image for this merchant are settled as
 * `existing` so a resumed import does not re-spend DeepSeek or Serper credits.
 */
async function enrichSupermarketItems(
  inputs: AutopilotEnrichmentInput[],
  options: { merchantId?: string; vendorTypeId: number },
): Promise<EnrichResponse> {
  const categories = autopilotCategories(options.vendorTypeId);
  const categoryKeys = new Set(categories.map((category) => category.key));
  const fallbackCategory = defaultAutopilotCategoryKey(options.vendorTypeId);
  const resumed = options.merchantId
    ? await existingImagesByBarcode(
        options.merchantId,
        inputs.map((input) => input.barcode),
      )
    : new Map<string, { categoryKey: string | null }>();

  const settled = new Map<string, AutopilotEnrichment>();
  const pending: { input: AutopilotEnrichmentInput; candidates: MasterCatalogItem[] }[] = [];

  for (const input of inputs) {
    const exists = input.barcode ? resumed.get(input.barcode) : undefined;
    if (exists) {
      settled.set(input.id, {
        id: input.id,
        imageDataUrl: null,
        imageUrlRaw: null,
        imageSource: "existing",
        categoryKey:
          exists.categoryKey && categoryKeys.has(exists.categoryKey)
            ? exists.categoryKey
            : fallbackCategory,
        masterCatalogId: null,
        searchQuery: null,
      });
      continue;
    }

    const query = [input.name, input.unit].filter(Boolean).join(" ");
    const candidates = await searchMasterCatalogProducts(query || input.name, 15);
    const exact = exactMasterMatch(candidates, input.name);
    if (!exact) {
      pending.push({ input, candidates });
      continue;
    }

    const image = masterImage(exact);
    settled.set(input.id, {
      id: input.id,
      imageDataUrl: image,
      imageUrlRaw: image,
      imageSource: image ? "master_catalog" : "no_image",
      categoryKey:
        exact.categoryKey && categoryKeys.has(exact.categoryKey)
          ? exact.categoryKey
          : fallbackCategory,
      masterCatalogId: exact.id,
      searchQuery: null,
    });
  }

  const deepseekItems: DeepSeekRequestItem[] = pending.map(({ input, candidates }) => ({
    id: input.id,
    name: input.name,
    unit: input.unit,
    barcode: input.barcode,
    candidates,
  }));
  const deepseek = await callDeepSeekEnrichment(deepseekItems, categories);
  const chosenIds = Array.from(deepseek?.values() ?? [])
    .map((result: DeepSeekEnrichmentResult) => result.masterCatalogId)
    .filter((id): id is string => Boolean(id));
  const chosen = await getMasterCatalogItemsByIds(chosenIds);

  const enriched = await mapLimit(pending, 5, async ({ input }) => {
    const result = deepseek?.get(input.id);
    const master = result?.masterCatalogId
      ? chosen.get(result.masterCatalogId) ?? null
      : null;
    const categoryKey =
      result?.categoryKey && categoryKeys.has(result.categoryKey)
        ? result.categoryKey
        : master?.categoryKey && categoryKeys.has(master.categoryKey)
          ? master.categoryKey
          : fallbackCategory;

    if (master) {
      const image = masterImage(master);
      return {
        id: input.id,
        imageDataUrl: image,
        imageUrlRaw: image,
        imageSource: image ? ("master_catalog" as const) : ("no_image" as const),
        categoryKey,
        masterCatalogId: master.id,
        searchQuery: result?.searchQuery ?? null,
      };
    }

    const web = await findWebProductImage({
      barcode: input.barcode,
      query: result?.searchQuery ?? null,
      name: input.name,
      unit: input.unit,
    });
    const image = web?.url ?? null;
    return {
      id: input.id,
      imageDataUrl: image,
      imageUrlRaw: web?.url ?? null,
      imageSource: image ? ("web_search" as const) : ("no_image" as const),
      categoryKey,
      masterCatalogId: null,
      searchQuery: result?.searchQuery ?? null,
    };
  });

  const byId = new Map(enriched.map((item) => [item.id, item]));
  return {
    items: inputs.map(
      (input) =>
        settled.get(input.id) ??
        byId.get(input.id) ?? {
          id: input.id,
          imageDataUrl: null,
          imageUrlRaw: null,
          imageSource: "no_image",
          categoryKey: fallbackCategory,
          masterCatalogId: null,
          searchQuery: null,
        },
    ),
    tier2: Boolean(process.env.DEEPSEEK_API_KEY),
    tier3: Boolean(process.env.SERPER_API_KEY),
    imageProxy: Boolean(
      process.env.IMAGE_PROXY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}

/**
 * Vendor-aware entry point. Pharmacy runs the bilingual reference pipeline;
 * supermarkets keep the existing master-catalog/web image tiers.
 */
export async function enrichAutopilotItems(
  inputs: AutopilotEnrichmentInput[],
  options: { merchantId: string; vendorTypeId: number },
): Promise<EnrichResponse> {
  if (options.vendorTypeId === PHARMACY_VENDOR_TYPE_ID) {
    return enrichPharmacyItems(inputs, { merchantId: options.merchantId });
  }
  return enrichSupermarketItems(inputs, options);
}
