/**
 * Pure legacy-label → synced-dictionary remapper.
 *
 * The V1 export stored one free-text label per variation row. The V2 dictionary
 * has numeric groups and options, and a row may describe more than one property
 * ("شرقي صغير" = crust + size). This module resolves labels against the database
 * dictionary in layers: exact name, explicit aliases, numeric units, greedy
 * phrase decomposition, the existing valid pair, and finally fuzzy matching.
 * The dummy taste pair (variant 2, option 7) is never used as a fallback.
 */

import { smartTextScore } from "../../../src/lib/search/normalize";
import { normalizeName } from "./product-values";

export type Pair = { variantId: number; optionId: number };
export type DictOption = Pair & { nameAr: string; nameEn: string };
export type Dictionary = { options: DictOption[]; groupNames: Map<number, string> };
export type RemapContext = {
  productName: string;
  vendorTypeId: number | null;
  categoryName: string;
};
export type AttributeRow = {
  label: string;
  variantId: number | null;
  optionIds: number[];
};
export type Selection = { variantId: number; optionIds: number[] };
export type LabelMapping = { label: string; pairs: Pair[]; source: string };
export type RemapResult = {
  selections: Selection[];
  mappings: LabelMapping[];
  unmapped: string[];
};

export const DUMMY_TASTE: Pair = { variantId: 2, optionId: 7 };
const REGULAR = new Set(
  ["عادي", "عاديه", "عادى", "عاديا", "regular", "plain", "normal"].map(normalizeName),
);

export function isDummyTaste(pair: Pair): boolean {
  return pair.variantId === DUMMY_TASTE.variantId && pair.optionId === DUMMY_TASTE.optionId;
}

export function isRegularLabel(label: string): boolean {
  return REGULAR.has(normalizeName(label));
}

const SIZE_ALIASES: Array<[string[], Pair]> = [
  [["m", "medium", "ستاندرد", "standard"], { variantId: 1, optionId: 2 }],
  [["l", "large", "لارج"], { variantId: 1, optionId: 3 }],
  [["s", "small"], { variantId: 1, optionId: 1 }],
  [["xl", "xlarge", "اكس لارج"], { variantId: 1, optionId: 51 }],
  [["xxl", "2xl"], { variantId: 1, optionId: 51 }],
  [["دبل", "دوبل", "دابل", "double", "dbl"], { variantId: 1, optionId: 50 }],
  [["تربل", "تربيل", "تريبل", "triple"], { variantId: 1, optionId: 70 }],
  [["كب"], { variantId: 1, optionId: 3 }],
  [["1/2", "نص", "نصف"], { variantId: 6, optionId: 26 }],
  [["1/4", "ربع"], { variantId: 6, optionId: 25 }],
  [["3/4"], { variantId: 6, optionId: 27 }],
  [["1/3", "تلت"], { variantId: 6, optionId: 101 }],
  [["1/8", "تمن", "ثمن"], { variantId: 6, optionId: 100 }],
  [["فرنسي"], { variantId: 3, optionId: 45 }],
];

export type Phrases = {
  map: Map<string, Pair[]>;
  keys: string[];
  valid: Set<string>;
};

const pairKey = (pair: Pair) => `${pair.variantId}:${pair.optionId}`;

function addPhrase(map: Map<string, Pair[]>, text: string, pair: Pair): void {
  const key = normalizeName(text);
  if (!key) return;
  const bucket = map.get(key) ?? [];
  if (!bucket.some((item) => pairKey(item) === pairKey(pair))) bucket.push(pair);
  map.set(key, bucket);
}

export function buildPhrases(dictionary: Dictionary): Phrases {
  const map = new Map<string, Pair[]>();
  const valid = new Set<string>();
  for (const option of dictionary.options) {
    const pair = { variantId: option.variantId, optionId: option.optionId };
    valid.add(pairKey(pair));
    addPhrase(map, option.nameAr, pair);
    addPhrase(map, option.nameEn, pair);
  }
  for (const [aliases, pair] of SIZE_ALIASES) {
    if (!valid.has(pairKey(pair))) continue;
    for (const alias of aliases) addPhrase(map, alias, pair);
  }
  return {
    map,
    keys: [...map.keys()].sort((left, right) => right.length - left.length),
    valid,
  };
}

function contextWeight(pair: Pair, context: RemapContext): number {
  const text = normalizeName(`${context.productName} ${context.categoryName}`);
  const bakery = context.vendorTypeId === 6 || /فطير|بيتزا|عيش|مخبز/.test(text);
  const coffee = context.vendorTypeId === 2 || /قهو|محمص|عصير/.test(text);
  if (pair.variantId === 2) return 36;
  if (bakery && (pair.variantId === 3 || pair.variantId === 9)) return 40;
  if (coffee && pair.variantId === 5) return 40;
  if (pair.variantId === 1) return 20;
  if (pair.variantId === 6) return 20;
  if (pair.variantId === 10) return 25;
  if (pair.variantId === 13) return 25;
  if (pair.variantId === 15) return 25;
  return 5;
}

function pickPair(
  candidates: Pair[],
  usedGroups: Set<number>,
  current: Pair | null,
  context: RemapContext,
  label: string,
): Pair | null {
  let pool = candidates;
  if (!isRegularLabel(label)) {
    const withoutDummy = pool.filter((pair) => !isDummyTaste(pair));
    if (withoutDummy.length > 0) pool = withoutDummy;
  }
  if (pool.length === 0) return null;
  if (current && pool.some((pair) => pairKey(pair) === pairKey(current))) {
    return current;
  }
  if (isRegularLabel(label)) {
    const regular = pool.find((pair) => isDummyTaste(pair));
    if (regular) return regular;
  }
  const free = pool.filter((pair) => !usedGroups.has(pair.variantId));
  if (free.length === 1) return free[0];
  const ranked = (free.length > 0 ? free : pool)
    .map((pair) => ({ pair, score: contextWeight(pair, context) }))
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.pair ?? null;
}

function numericPair(text: string): Pair | null {
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)\s*(كيلو|كجم|kg)?$/);
  if (fraction) {
    const map: Record<string, Pair> = {
      "1/2": { variantId: 6, optionId: 26 },
      "1/4": { variantId: 6, optionId: 25 },
      "3/4": { variantId: 6, optionId: 27 },
      "1/3": { variantId: 6, optionId: 101 },
      "1/8": { variantId: 6, optionId: 100 },
    };
    return map[`${fraction[1]}/${fraction[2]}`] ?? null;
  }
  const storage = text.match(/^(\d+)\s*(gb|جيجا)?$/);
  if (storage) {
    const map: Record<string, number> = { "64": 131, "128": 129, "256": 130 };
    const optionId = map[storage[1]];
    return optionId ? { variantId: 14, optionId } : null;
  }
  const gram = text.match(/(\d+)\s*(جرام|جم|g)/);
  if (gram) {
    const value = Number(gram[1]);
    const buckets: Array<[number, number]> = [
      [100, 100], [250, 25], [500, 26], [750, 27], [1000, 28],
      [1500, 73], [2000, 74], [3000, 75], [4000, 76],
    ];
    const closest = buckets.reduce((best, item) =>
      Math.abs(item[0] - value) < Math.abs(best[0] - value) ? item : best,
    );
    return { variantId: 6, optionId: closest[1] };
  }
  const ml = text.match(/(\d+)\s*(ملل|مل|ml)/);
  if (ml) {
    const value = Number(ml[1]);
    const buckets: Array<[number, number]> = [
      [10, 29], [20, 30], [30, 31], [40, 32], [50, 33],
      [60, 34], [70, 35], [80, 36], [90, 37], [100, 38],
    ];
    const closest = buckets.reduce((best, item) =>
      Math.abs(item[0] - value) < Math.abs(best[0] - value) ? item : best,
    );
    return { variantId: 7, optionId: closest[1] };
  }
  if (/\d+\s*(لتر|liter|l)$/.test(text)) return { variantId: 7, optionId: 38 };
  return null;
}

function currentPair(row: AttributeRow, valid: Set<string>): Pair | null {
  if (row.variantId == null || row.optionIds.length === 0) return null;
  const pair = { variantId: row.variantId, optionId: row.optionIds[0] };
  return valid.has(pairKey(pair)) ? pair : null;
}

export function mapLabel(
  row: AttributeRow,
  dictionary: Dictionary,
  phrases: Phrases,
  context: RemapContext,
): LabelMapping | null {
  const label = row.label.trim();
  const normalized = normalizeName(label);
  if (!normalized) return null;
  const current = currentPair(row, phrases.valid);

  const exact = phrases.map.get(normalized);
  if (exact) {
    const pair = pickPair(exact, new Set(), current, context, label);
    return pair ? { label, pairs: [pair], source: "exact" } : null;
  }

  const used = new Set<number>();
  const pairs: Pair[] = [];
  let source = "decomposed";
  let working = ` ${normalized} `;

  const numeric = numericPair(normalized);
  if (numeric && phrases.valid.has(pairKey(numeric))) {
    pairs.push(numeric);
    used.add(numeric.variantId);
    source = "numeric";
  } else {
    const matches: Array<{ refs: Pair[]; key: string }> = [];
    for (const key of phrases.keys) {
      if (!working.includes(` ${key} `)) continue;
      const refs = phrases.map.get(key) ?? [];
      matches.push({ refs, key });
      working = working.split(` ${key} `).join(" ");
    }
    matches.sort((left, right) => left.refs.length - right.refs.length);
    for (const match of matches) {
      const pair = pickPair(match.refs, used, current, context, label);
      if (!pair) continue;
      pairs.push(pair);
      used.add(pair.variantId);
    }
  }

  if (pairs.length > 0) {
    return { label, pairs: dedupePairs(pairs), source };
  }

  if (current && (isRegularLabel(label) || !isDummyTaste(current))) {
    return { label, pairs: [current], source: "existing" };
  }

  let best: { pair: Pair; score: number } | null = null;
  for (const option of dictionary.options) {
    const pair = { variantId: option.variantId, optionId: option.optionId };
    if (!isRegularLabel(label) && isDummyTaste(pair)) continue;
    const score = smartTextScore(normalized, normalizeName(option.nameAr)).score;
    if (!best || score > best.score) best = { pair, score };
  }
  if (best && best.score >= 55) {
    return { label, pairs: [best.pair], source: "fuzzy" };
  }
  return null;
}

function dedupePairs(pairs: Pair[]): Pair[] {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = pairKey(pair);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function remapAttributes(
  rows: AttributeRow[],
  dictionary: Dictionary,
  context: RemapContext,
): RemapResult {
  const phrases = buildPhrases(dictionary);
  const selected = new Map<number, Set<number>>();
  const mappings: LabelMapping[] = [];
  const unmapped: string[] = [];

  for (const row of rows) {
    const mapping = mapLabel(row, dictionary, phrases, context);
    if (!mapping) {
      if (row.label.trim()) unmapped.push(row.label.trim());
      continue;
    }
    mappings.push(mapping);
    for (const pair of mapping.pairs) {
      if (!isRegularLabel(row.label) && isDummyTaste(pair)) continue;
      const bucket = selected.get(pair.variantId) ?? new Set<number>();
      bucket.add(pair.optionId);
      selected.set(pair.variantId, bucket);
    }
  }

  const selections = [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([variantId, optionIds]) => ({
      variantId,
      optionIds: [...optionIds].sort((left, right) => left - right),
    }));

  return { selections, mappings, unmapped };
}
