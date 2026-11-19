import { normalizeSearchText } from "@/lib/search/normalize";

/**
 * Reference catalog search.
 *
 * Egyptian POS names are noisy and reordered, so retrieval is OR-based: any
 * meaningful token, synonym or trigram overlap keeps a candidate alive. Exact,
 * prefix, infix and category hits still rank higher, and deterministic sorting
 * keeps identical names stable between requests.
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
  nameWords: Set<string>;
  haystackWords: Set<string>;
};

const SYNONYM_GROUPS: string[][] = [
  ["قهوة", "قهوه", "كوفي", "coffee"],
  ["حليب", "لبن", "milk"],
  ["شاي", "شاهي", "tea"],
  ["زبادي", "زبادى", "روب", "yogurt", "yoghurt"],
  ["جبن", "جبنة", "جبنه", "cheese"],
  ["زبدة", "زبده", "butter"],
  ["مكرونة", "مكرونه", "معكرونة", "معكرونه", "pasta", "macaroni"],
  ["أرز", "ارز", "رز", "rice"],
  ["سكر", "sugar"],
  ["زيت", "oil"],
  ["دقيق", "طحين", "flour"],
  ["شيبسي", "شيبس", "chips"],
  ["بسكويت", "بسكوت", "biscuit", "cookie"],
  ["مياه", "ميه", "مياة", "water"],
  ["عصير", "juice"],
  ["صابون", "soap"],
  ["شامبو", "shampoo"],
  ["مناديل", "كلينكس", "tissue"],
  ["منظف", "منظفات", "detergent", "cleaner"],
  ["معجون", "toothpaste"],
  ["مسحوق", "بودرة", "بودره", "powder"],
];

const UNIT_TOKENS = new Map<string, string>([
  ["جم", "g"],
  ["جرام", "g"],
  ["جرامات", "g"],
  ["g", "g"],
  ["gr", "g"],
  ["كجم", "kg"],
  ["كيلو", "kg"],
  ["كيلوجرام", "kg"],
  ["ك", "kg"],
  ["kg", "kg"],
  ["كغ", "kg"],
  ["مل", "ml"],
  ["ملي", "ml"],
  ["ملل", "ml"],
  ["ml", "ml"],
  ["لتر", "l"],
  ["ل", "l"],
  ["lt", "l"],
  ["l", "l"],
]);

const NOISE_TOKENS = new Set([
  "بالوزن",
  "قطعة",
  "قطعه",
  "قطع",
  "عدد",
  "صنف",
  "منتج",
  "كود",
  "باركود",
  "سعر",
]);

function normalizeProductText(value: string): string {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => UNIT_TOKENS.get(token) ?? token)
    .join(" ")
    .trim();
}

function bareWord(word: string): string {
  return word.startsWith("ال") && word.length > 3 ? word.slice(2) : word;
}

function wordSet(text: string): Set<string> {
  return new Set(text.split(" ").filter(Boolean).map(bareWord));
}

function trigrams(value: string): Set<string> {
  const compact = value.replace(/\s+/g, " ").trim();
  const grams = new Set<string>();
  for (let index = 0; index < compact.length - 2; index += 1) {
    grams.add(compact.slice(index, index + 3));
  }
  return grams;
}

function trigramSimilarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

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
  const nameKey = normalizeProductText(item.name);
  const haystack = normalizeProductText(
    [item.name, item.categoryLabel, item.id].join(" "),
  );
  return {
    ...item,
    nameKey,
    haystack,
    nameWords: wordSet(nameKey),
    haystackWords: wordSet(haystack),
  };
}

export function masterCatalogTokens(query: string): string[] {
  return normalizeProductText(query)
    .split(" ")
    .filter((token) => token.length > 0 && !NOISE_TOKENS.has(token));
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
  let matchedWeight = 0;
  let totalWeight = 0;

  for (const token of tokens) {
    const weight = token.length >= 4 ? 1.2 : 1;
    totalWeight += weight;
    const aliases = tokenAliases(token);
    let hit = 0;
    if (aliases.some((alias) => item.nameKey === alias)) {
      hit = 100;
    } else if (item.nameKey.startsWith(token)) {
      hit = 40;
    } else if (aliases.some((alias) => item.nameKey.startsWith(alias))) {
      // A synonym prefix (شاهي → شاهين) is weaker than the typed word so real
      // matches for the rep's spelling win the tie.
      hit = 32;
    } else if (item.nameWords.has(bareWord(token))) {
      hit = 20;
    } else if (aliases.some((alias) => item.nameWords.has(bareWord(alias)))) {
      hit = 16;
    } else if (
      aliases.some((alias) => item.haystackWords.has(bareWord(alias)))
    ) {
      hit = 8;
    }
    if (hit > 0) {
      matchedWeight += weight;
      score += Math.round(hit * weight);
    }
  }

  if (matchedWeight > 0) {
    // Coverage bonus: a name that satisfies every token outranks a single-token
    // collision, without the old AND rule forcing a zero candidate list.
    return score + Math.round((matchedWeight / totalWeight) * 120);
  }

  const similarity = trigramSimilarity(item.nameKey, tokens.join(" "));
  return similarity >= 0.34 ? Math.round(similarity * 80) : 0;
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
