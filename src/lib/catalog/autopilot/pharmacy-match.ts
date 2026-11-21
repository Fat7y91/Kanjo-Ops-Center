import { normalizeSearchText, smartTextScore } from "@/lib/search/normalize";

import { toLatinDigits } from "./parse-values";
import {
  attributeConflict,
  extractPharmacyAttributes,
  type AttributeConflict,
  type PharmacyAttributes,
} from "./pharmacy-attributes";

/**
 * Deterministic first stage of the pharmacy matcher.
 *
 * It only settles a pair it can prove: an exact code, or a strong name hit that
 * passes the strength/form/pack guardrails and is not ambiguous. Everything
 * else is returned as reviewed candidates for the bilingual model stage.
 */

export type ReferenceProduct = {
  id: string;
  name: string;
  barcode: string;
  categoryKey: string | null;
  imageUrl: string | null;
  description?: string;
  /** Precomputed once by the loader; falls back to parsing the name. */
  attributes?: PharmacyAttributes;
};

export type PharmacyMatchInput = {
  name: string;
  barcode?: string;
  company?: string;
};

export type PharmacyCandidate = {
  product: ReferenceProduct;
  score: number;
  conflict: AttributeConflict | null;
};

export type PharmacyMatchReason =
  | "barcode"
  | "name"
  | "none"
  | "ambiguous"
  | "conflict";

export type PharmacyMatchResult = {
  match: ReferenceProduct | null;
  score: number;
  reason: PharmacyMatchReason;
  conflict: AttributeConflict | null;
  candidates: ReferenceProduct[];
};

const MIN_NAME_SCORE = 82;
const AMBIGUITY_GAP = 5;
const MAX_CANDIDATES = 15;

/**
 * Tokens that carry strength/form/pack meaning. They are removed before the
 * name comparison so the guardrail, not the string score, decides those, and an
 * extra "20 قرص" in the POS name does not hide an otherwise exact product.
 */
const ATTRIBUTE_TOKENS = new Set([
  "mg", "mcg", "g", "gm", "gram", "grams", "iu", "ml", "l", "liter", "liters",
  "tab", "tabs", "tablet", "tablets", "cap", "caps", "capsule", "capsules",
  "supp", "suppository", "suppositories", "syrup", "susp", "suspension",
  "cream", "ointment", "drop", "drops", "injection", "inj", "vial", "amp",
  "ampoule", "spray", "sachet", "sachets", "gel", "lotion", "shampoo",
  "solution", "emulsion", "powder", "strip", "strips", "x",
  "قرص", "اقراص", "حبه", "حبات", "كبسوله", "كبسولات", "كبس",
  "شراب", "سيرب", "معلق", "معلقه", "لبوس", "تحاميل", "كريم", "دهان",
  "مرهم", "قطره", "قطرات", "حقن", "امبول", "امبولات", "فيال", "بخاخ",
  "سبراي", "اكياس", "كيس", "جل", "لوشن", "شامبو", "محلول", "مستحلب",
  "مسحوق", "بودره", "شريط", "شرائط", "جرام", "غرام", "جم", "مجم",
  "مج", "ملجم", "مل", "لتر", "ليتر", "ميكروجرام",
]);

function coreName(value: string): string {
  return normalizeSearchText(toLatinDigits(value))
    .split(" ")
    .filter(
      (token) =>
        token &&
        !/^\d+(?:\.\d+)?$/.test(token) &&
        !ATTRIBUTE_TOKENS.has(token),
    )
    .join(" ");
}

function digits(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function codesEqual(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const a = digits(left);
  const b = digits(right);
  return a.length >= 6 && a === b;
}

function companyBonus(input: PharmacyMatchInput, product: ReferenceProduct): number {
  const company = normalizeSearchText(input.company ?? "");
  if (!company) return 0;
  const name = normalizeSearchText(product.name);
  return company
    .split(" ")
    .filter((token) => token.length >= 3)
    .some((token) => name.includes(token))
    ? 6
    : 0;
}

function pairScore(
  input: PharmacyMatchInput,
  product: ReferenceProduct,
  queryOverride?: string,
): number {
  const nameScore = smartTextScore(
    coreName(queryOverride ?? input.name) || queryOverride || input.name,
    coreName(product.name) || product.name,
  ).score;
  return Math.min(100, nameScore + companyBonus(input, product));
}

/** Ranks candidates; an optional English query lets bilingual retrieval work. */
export function rankReferenceCandidates(
  input: PharmacyMatchInput,
  products: ReferenceProduct[],
  queryOverride?: string,
): PharmacyCandidate[] {
  const source = extractPharmacyAttributes(input.name);
  return products
    .map((product) => ({
      product,
      score: pairScore(input, product, queryOverride),
      conflict: attributeConflict(
        source,
        product.attributes ?? extractPharmacyAttributes(product.name),
      ),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.product.id.localeCompare(right.product.id),
    );
}

function barcodeMatches(input: PharmacyMatchInput, product: ReferenceProduct): boolean {
  const barcode = input.barcode?.trim() ?? "";
  return codesEqual(barcode, product.barcode?.trim() ?? "");
}

/**
 * Stage 1 match. A barcode hit is accepted only when the guardrails agree, so a
 * mislabelled reference row never drags the merchant's drug onto another
 * strength or form.
 */
export function matchPharmacyItem(
  input: PharmacyMatchInput,
  products: ReferenceProduct[],
): PharmacyMatchResult {
  const byBarcode = products.filter((product) => barcodeMatches(input, product));
  if (byBarcode.length > 0) {
    const ranked = rankReferenceCandidates(input, byBarcode);
    const top = ranked[0];
    if (top.conflict) {
      return {
        match: null,
        score: 100,
        reason: "conflict",
        conflict: top.conflict,
        candidates: [top.product],
      };
    }
    return {
      match: top.product,
      score: 100,
      reason: "barcode",
      conflict: null,
      candidates: [top.product],
    };
  }

  const ranked = rankReferenceCandidates(input, products);
  const compatible = ranked.filter((candidate) => !candidate.conflict);
  const pool = compatible.length > 0 ? compatible : ranked;
  const candidates = pool
    .filter((candidate) => candidate.score > 0)
    .slice(0, MAX_CANDIDATES)
    .map((candidate) => candidate.product);

  if (compatible.length === 0) {
    return {
      match: null,
      score: 0,
      reason: "conflict",
      conflict: ranked[0]?.conflict ?? null,
      candidates,
    };
  }

  const top = compatible[0];
  if (top.score < MIN_NAME_SCORE) {
    return {
      match: null,
      score: top.score,
      reason: "none",
      conflict: null,
      candidates,
    };
  }

  const second = compatible[1];
  if (second && top.score - second.score < AMBIGUITY_GAP) {
    return {
      match: null,
      score: top.score,
      reason: "ambiguous",
      conflict: null,
      candidates,
    };
  }

  return {
    match: top.product,
    score: top.score,
    reason: "name",
    conflict: null,
    candidates,
  };
}

/**
 * Re-validates a candidate chosen by the bilingual model. The model may only
 * pick ids we sent, and the guardrail runs again because models occasionally
 * ignore the strength/form instruction.
 */
export function confirmCandidate(
  input: PharmacyMatchInput,
  products: ReferenceProduct[],
  chosenId: string | null | undefined,
): { product: ReferenceProduct | null; conflict: AttributeConflict | null } {
  if (!chosenId) return { product: null, conflict: null };
  const product = products.find((candidate) => candidate.id === chosenId) ?? null;
  if (!product) return { product: null, conflict: null };
  const conflict = attributeConflict(
    extractPharmacyAttributes(input.name),
    product.attributes ?? extractPharmacyAttributes(product.name),
  );
  return { product: conflict ? null : product, conflict };
}
