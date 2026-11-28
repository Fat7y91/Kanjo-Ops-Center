const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

/**
 * Forgiving Arabic/Latin search normalisation.
 *
 * Handles hamza forms, alef variants, teh marbuta, alef maqsura, tatweel,
 * Arabic diacritics, Latin accents, punctuation, and repeated whitespace.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(ARABIC_MARKS, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Secondary key that collapses Arabic letters differing only by dots. It is
 * used only as a fallback so normal fuzzy matching stays precise.
 */
export function dotlessSearchText(value: string): string {
  return normalizeSearchText(value)
    .replace(/[بتثني]/g, "ٮ")
    .replace(/[جحخ]/g, "ح")
    .replace(/[دذ]/g, "د")
    .replace(/[رز]/g, "ر")
    .replace(/[سش]/g, "س")
    .replace(/[صض]/g, "ص")
    .replace(/[طظ]/g, "ط")
    .replace(/[عغ]/g, "ع")
    .replace(/[فق]/g, "ف");
}

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        previous[rightIndex - 1] +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution,
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[right.length];
}

export type SmartMatch = {
  score: number;
  matchType: "exact" | "prefix" | "contains" | "token" | "dotless" | "fuzzy";
};

export function smartTextScore(query: string, candidate: string): SmartMatch {
  const q = normalizeSearchText(query);
  const c = normalizeSearchText(candidate);
  if (!q || !c) return { score: 0, matchType: "exact" };

  if (c === q) return { score: 100, matchType: "exact" };
  if (c.startsWith(q)) return { score: 92, matchType: "prefix" };
  if (c.includes(q)) return { score: 86, matchType: "contains" };

  const queryTokens = q.split(" ");
  const candidateTokens = c.split(" ");

  if (
    queryTokens.every((token) => candidateTokens.some((part) => part === token))
  ) {
    return { score: 82, matchType: "token" };
  }

  if (
    queryTokens.every((token) =>
      candidateTokens.some((part) => part.startsWith(token)),
    )
  ) {
    return { score: 78, matchType: "token" };
  }

  if (
    queryTokens.every((token) =>
      candidateTokens.some((part) => part.includes(token)),
    )
  ) {
    return { score: 72, matchType: "token" };
  }

  const dotlessQuery = dotlessSearchText(q);
  const dotlessCandidate = dotlessSearchText(c);
  if (dotlessCandidate === dotlessQuery) {
    return { score: 68, matchType: "dotless" };
  }
  if (dotlessCandidate.includes(dotlessQuery)) {
    return { score: 62, matchType: "dotless" };
  }

  const threshold = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  const wholeDistance = levenshtein(q, c);
  const tokenDistance = Math.min(
    ...queryTokens.map((token) =>
      Math.min(
        ...candidateTokens.map((part) => levenshtein(token, part)),
      ),
    ),
  );
  const distance = Math.min(wholeDistance, tokenDistance);

  if (distance <= threshold) {
    return { score: 60 - distance * 5, matchType: "fuzzy" };
  }

  return { score: 0, matchType: "fuzzy" };
}
