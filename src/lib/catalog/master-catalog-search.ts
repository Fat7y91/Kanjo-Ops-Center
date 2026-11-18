import { normalizeSearchText } from "@/lib/search/normalize";

/**
 * Reference catalog search.
 *
 * Port of the V1 master-catalog matcher: every query token must land in the
 * name/category haystack (after synonym expansion), and exact, prefix, infix
 * and category-only hits score progressively lower. Ranking is deterministic so
 * identical names never shuffle between requests.
 */

export type MasterCatalogItem = {
  id: string;
  name: string;
  categoryLabel: string;
  categoryKey: string | null;
  price: number;
  imageUrl: string;
  driveFileId: string;
};

export type PreparedMasterCatalogItem = MasterCatalogItem & {
  nameKey: string;
  haystack: string;
};

const SYNONYM_GROUPS: string[][] = [
  ["قهوة", "كوفي", "coffee"],
  ["حليب", "لبن", "milk"],
  ["شاي", "شاهي", "tea"],
  ["زبادي", "زبادى", "yogurt", "yoghurt"],
];

const SYNONYMS = (() => {
  const map = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    const normalized = group.map(normalizeSearchText).filter(Boolean);
    for (const token of normalized) {
      const aliases = map.get(token) ?? [];
      for (const alias of normalized) {
        if (!aliases.includes(alias)) aliases.push(alias);
      }
      map.set(token, aliases);
    }
  }
  return map;
})();

export function prepareMasterCatalogItem(
  item: MasterCatalogItem,
): PreparedMasterCatalogItem {
  return {
    ...item,
    nameKey: normalizeSearchText(item.name),
    haystack: normalizeSearchText(
      [item.name, item.categoryLabel, item.id].join(" "),
    ),
  };
}

export function masterCatalogTokens(query: string): string[] {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

function tokenAliases(token: string): string[] {
  const aliases = SYNONYMS.get(token) ?? [token];
  return aliases.length === 0 ? [token] : aliases;
}

export function masterCatalogScore(
  item: PreparedMasterCatalogItem,
  tokens: string[],
): number {
  if (tokens.length === 0) return 0;

  let score = 0;
  for (const token of tokens) {
    const aliases = tokenAliases(token);
    if (!aliases.some((alias) => item.haystack.includes(alias))) return 0;
    if (aliases.some((alias) => item.nameKey === alias)) {
      score += 100;
    } else if (item.nameKey.startsWith(token)) {
      score += 40;
    } else if (aliases.some((alias) => item.nameKey.startsWith(alias))) {
      // A synonym prefix (شاهي → شاهين) is weaker than the typed word so real
      // matches for the rep's spelling win the tie.
      score += 32;
    } else if (item.nameKey.includes(token)) {
      score += 20;
    } else if (aliases.some((alias) => item.nameKey.includes(alias))) {
      score += 16;
    } else {
      score += 8;
    }
  }
  return score;
}

/** Ranks prepared rows and returns plain items ready for JSON serialisation. */
export function searchMasterCatalog(
  items: PreparedMasterCatalogItem[],
  query: string,
  limit = 20,
): MasterCatalogItem[] {
  const tokens = masterCatalogTokens(query);
  if (tokens.length === 0) return [];

  return items
    .map((item) => ({ item, score: masterCatalogScore(item, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.item.name.localeCompare(right.item.name, "ar"),
    )
    .slice(0, limit)
    .map(({ item }) => ({
      id: item.id,
      name: item.name,
      categoryLabel: item.categoryLabel,
      categoryKey: item.categoryKey,
      price: item.price,
      imageUrl: item.imageUrl,
      driveFileId: item.driveFileId,
    }));
}
