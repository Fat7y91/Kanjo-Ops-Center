import "server-only";

import { mirrorRemoteImage } from "@/lib/catalog/images/mirror";

import {
  autopilotCategories,
  defaultAutopilotCategoryKey,
  PHARMACY_VENDOR_TYPE_ID,
} from "./categories";
import {
  callDeepSeekPharmacyMatch,
  translatePharmacyQueries,
} from "./deepseek-pharmacy";
import {
  confirmCandidate,
  matchPharmacyItem,
  rankReferenceCandidates,
} from "./pharmacy-match";
import type { ReferenceProduct } from "./pharmacy-match";
import {
  auditReferenceText,
  cleanProductDescription,
  neutralDescription,
} from "./quality-gate";
import { loadDefaultReferenceProducts } from "./reference-catalog";
import type {
  AutopilotEnrichResponse,
  AutopilotEnrichment,
  AutopilotEnrichmentInput,
} from "./types";

/**
 * Two-stage pharmacy enrichment.
 *
 * Stage 1 resolves barcodes / strong names and keeps only guardrail-safe
 * candidates. Stage 2 asks the bilingual model to confirm a candidate and pick
 * a controlled category. The reference description is reused only when it
 * passes the quality gate; otherwise a neutral factual copy is written. Every
 * reused image is mirrored first, so no third-party URL reaches the catalog.
 */

const MAX_CANDIDATES = 15;
const IMAGE_CONCURRENCY = 3;

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

function uniqueCandidates(candidates: ReferenceProduct[]): ReferenceProduct[] {
  const seen = new Set<string>();
  const result: ReferenceProduct[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    result.push(candidate);
    if (result.length >= MAX_CANDIDATES) break;
  }
  return result;
}

function noMatch(
  input: AutopilotEnrichmentInput,
  categoryKey: string,
  needsReview: boolean,
): AutopilotEnrichment {
  return {
    id: input.id,
    imageDataUrl: null,
    imageUrlRaw: null,
    imageSource: "no_image",
    categoryKey,
    masterCatalogId: null,
    searchQuery: null,
    referenceProductId: null,
    matchedName: null,
    description: neutralDescription({
      name: input.name,
      company: input.company,
    }),
    needsReview,
  };
}

export async function enrichPharmacyItems(
  inputs: AutopilotEnrichmentInput[],
  options: { merchantId: string },
): Promise<AutopilotEnrichResponse> {
  const categories = autopilotCategories(PHARMACY_VENDOR_TYPE_ID);
  const categoryKeys = new Set(categories.map((category) => category.key));
  const fallbackCategory = defaultAutopilotCategoryKey(PHARMACY_VENDOR_TYPE_ID);
  const reference = await loadDefaultReferenceProducts();

  const stage1 = inputs.map((input) => ({
    input,
    match: matchPharmacyItem(input, reference),
  }));

  // Arabic POS names rarely share tokens with the English reference names.
  // Translate the weak rows, retrieve English candidates locally, then let the
  // bilingual confirmation call choose among guardrail-safe rows.
  const translations =
    reference.length > 0
      ? await translatePharmacyQueries(
          stage1
            .filter(({ match }) => match.candidates.length < 3)
            .map(({ input }) => ({
              id: input.id,
              name: input.name,
              company: input.company ?? "",
              unit: input.unit,
            })),
        )
      : null;

  const itemsToMatch = stage1.map(({ input, match }) => {
    const query = translations?.get(input.id);
    if (!query) return { input, match };
    const extra = rankReferenceCandidates(input, reference, query)
      .filter((candidate) => !candidate.conflict && candidate.score > 0)
      .slice(0, MAX_CANDIDATES)
      .map((candidate) => candidate.product);
    return {
      input,
      match: {
        ...match,
        candidates: uniqueCandidates([...match.candidates, ...extra]),
      },
    };
  });

  const deepseekItems = itemsToMatch
    .map(({ input, match }) => ({
      id: input.id,
      name: input.name,
      company: input.company ?? "",
      unit: input.unit,
      barcode: input.barcode,
      candidates: uniqueCandidates(match.candidates),
    }))
    .filter((item) => item.candidates.length > 0);
  const deepseek =
    deepseekItems.length > 0
      ? await callDeepSeekPharmacyMatch(deepseekItems, categories)
      : null;

  const items = await mapLimit(itemsToMatch, IMAGE_CONCURRENCY, async ({ input, match }) => {
    const model = deepseek?.get(input.id);
    let chosen = match.match;

    const confirmed = confirmCandidate(
      input,
      match.candidates,
      model?.masterCatalogId ?? null,
    );
    if (confirmed.product) chosen = confirmed.product;
    else if (confirmed.conflict) chosen = null;

    const categoryKey =
      model?.categoryKey && categoryKeys.has(model.categoryKey)
        ? model.categoryKey
        : chosen?.categoryKey && categoryKeys.has(chosen.categoryKey)
          ? chosen.categoryKey
          : fallbackCategory;

    if (!chosen) {
      return noMatch(input, categoryKey, true);
    }

    const audit = auditReferenceText({
      name: chosen.name,
      description: chosen.description,
      categoryKey: chosen.categoryKey,
      imageUrl: chosen.imageUrl,
    });
    const description = audit.descriptionValid
      ? cleanProductDescription(chosen.description)
      : neutralDescription({ name: input.name, company: input.company });
    const hosted = await mirrorRemoteImage(chosen.imageUrl, options.merchantId);

    return {
      id: input.id,
      imageDataUrl: hosted,
      imageUrlRaw: chosen.imageUrl,
      imageSource: hosted ? ("reference" as const) : ("no_image" as const),
      categoryKey,
      masterCatalogId: null,
      searchQuery: model?.searchQuery ?? null,
      referenceProductId: chosen.id,
      matchedName: chosen.name,
      description,
      needsReview:
        !hosted ||
        !categoryKeys.has(categoryKey) ||
        !audit.descriptionValid ||
        !audit.nameValid,
    };
  });

  return {
    items,
    tier2: Boolean(process.env.DEEPSEEK_API_KEY),
    tier3: false,
    imageProxy: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
