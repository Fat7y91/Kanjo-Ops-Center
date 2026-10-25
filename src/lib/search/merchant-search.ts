import type {
  City,
  Merchant,
  MerchantSearchResult,
} from "@/lib/field-ops/types";
import { listCities, listMerchants } from "@/lib/field-ops/store";
import {
  normalizeSearchText,
  smartTextScore,
} from "@/lib/search/normalize";

export function merchantSearchKey(name: string): string {
  return normalizeSearchText(name);
}

export function searchMerchants(
  query: string,
  viewerTeam: string,
  limit = 20,
): MerchantSearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];

  const cities = new Map<string, City>(
    listCities().map((city) => [city.id, city]),
  );

  const results = listMerchants()
    .map((merchant) => {
      const city = cities.get(merchant.cityId);
      const nameMatch = smartTextScore(trimmed, merchant.name);
      const cityMatch = city ? smartTextScore(trimmed, city.name) : null;
      const notesMatch = smartTextScore(
        trimmed,
        merchant.strategicNotes,
      );

      const candidates: Array<{
        score: number;
        matchType: string;
        priority: number;
      }> = [
        {
          score: nameMatch.score,
          matchType: `merchant ${nameMatch.matchType}`,
          priority: 3,
        },
      ];

      if (cityMatch && cityMatch.score > 0) {
        candidates.push({
          score: Math.round(cityMatch.score * 0.72),
          matchType: `city ${cityMatch.matchType}`,
          priority: 2,
        });
      }
      if (notesMatch.score >= 78) {
        candidates.push({
          score: Math.round(notesMatch.score * 0.6),
          matchType: `notes ${notesMatch.matchType}`,
          priority: 1,
        });
      }

      const best = candidates.sort(
        (left, right) =>
          right.score - left.score || right.priority - left.priority,
      )[0];

      return {
        merchant,
        cityName: city?.name ?? "Unassigned city",
        isOwnTeam: merchant.team === viewerTeam,
        score: best.score,
        matchType: best.matchType,
      } satisfies MerchantSearchResult;
    })
    .filter((result) => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.isOwnTeam) - Number(left.isOwnTeam) ||
        left.merchant.name.localeCompare(right.merchant.name, "ar"),
    )
    .slice(0, limit);

  return results;
}
