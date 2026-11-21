import { normalizeSearchText } from "@/lib/search/normalize";

import { toLatinDigits } from "./parse-values";

/**
 * Pure extraction of the attributes that must never be traded for a fuzzy name
 * hit: strength, dosage form and pack size. A pharmacy match is rejected when
 * any of them conflicts, so "Augmentin 1 g" can never map to "Augmentin 625 mg"
 * and a syrup can never map to a suppository.
 */

export type StrengthKind = "mass" | "iu" | "pct";

export type Strength = {
  kind: StrengthKind;
  /** Mass normalised to milligrams; iu/pct keep their numeric value. */
  value: number;
  raw: string;
};

export type PackSize = {
  count: number | null;
  volumeMl: number | null;
  raw: string;
};

export type PharmacyAttributes = {
  strengths: Strength[];
  forms: string[];
  pack: PackSize | null;
};

export type AttributeConflict = {
  kind: "strength" | "form" | "pack";
  detail: string;
};

const FORM_ALIASES: { canonical: string; aliases: string[] }[] = [
  { canonical: "tablet", aliases: ["tablet", "tablets", "tab", "tabs", "قرص", "اقراص", "حبوب", "حبه", "حبات"] },
  { canonical: "capsule", aliases: ["capsule", "capsules", "cap", "caps", "كبسوله", "كبسولات", "كبس"] },
  { canonical: "syrup", aliases: ["syrup", "syr", "شراب", "سيرب"] },
  { canonical: "suspension", aliases: ["suspension", "susp", "معلق", "معلقه"] },
  { canonical: "suppository", aliases: ["suppository", "supp", "suppositories", "لبوس", "تحاميل", "تحميله"] },
  { canonical: "cream", aliases: ["cream", "كريم", "دهان"] },
  { canonical: "ointment", aliases: ["ointment", "oint", "مرهم"] },
  { canonical: "drops", aliases: ["drops", "drop", "قطره", "قطرات"] },
  { canonical: "injection", aliases: ["injection", "inj", "ampoule", "ampoule", "vial", "حقن", "امبول", "امبولات", "امبول", "فيال"] },
  { canonical: "spray", aliases: ["spray", "بخاخ", "سبراي"] },
  { canonical: "sachet", aliases: ["sachet", "sachets", "packet", "اكياس", "اكياس", "كيس"] },
  { canonical: "gel", aliases: ["gel", "جل"] },
  { canonical: "lotion", aliases: ["lotion", "لوشن"] },
  { canonical: "shampoo", aliases: ["shampoo", "شامبو"] },
  { canonical: "solution", aliases: ["solution", "محلول"] },
  { canonical: "emulsion", aliases: ["emulsion", "مستحلب"] },
  { canonical: "powder", aliases: ["powder", "مسحوق", "بودره"] },
];

const STRENGTH_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(mg|mcg|microgram|micrograms|g|gm|gram|grams|iu|i\.u\.?|units?|%|ملجم|مجم|مج|جم|جرام|غرام|ميكروجرام)(?![a-z\u0600-\u06ff])/gi;

const COUNT_PATTERN =
  /(\d+)\s*(?:x\s*(\d+)\s*)?(?:قرص|اقراص|أقراص|حبه|حبة|حبات|tab|tabs|tablet|tablets|كبسوله|كبسولات|caps|capsule|capsules|امبول|أمبول|امبولات|أمبولات|amp|amps|ampoule|ampoules|vial|vials|sachet|sachets|اكياس|أكياس|كيس|شريط|شرائط|strip|strips)(?![a-z\u0600-\u06ff])/gi;

const VOLUME_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(ml|milliliter|milliliters|مل|l|liter|liters|لتر|ليتر)(?![a-z\u0600-\u06ff])/gi;

function normalized(value: string): string {
  return normalizeSearchText(toLatinDigits(value).replace(/[×*]/g, "x"));
}

function strengthKind(unit: string): StrengthKind | null {
  const token = unit.toLowerCase();
  if (["mg", "mcg", "microgram", "micrograms", "g", "gm", "gram", "grams", "ملجم", "مجم", "مج", "جم", "جرام", "غرام", "ميكروجرام"].includes(token)) {
    return "mass";
  }
  if (["iu", "i.u", "i.u.", "unit", "units"].includes(token)) return "iu";
  if (token === "%") return "pct";
  return null;
}

function toMilligrams(value: number, unit: string): number {
  const token = unit.toLowerCase();
  if (["mcg", "microgram", "micrograms", "ميكروجرام"].includes(token)) {
    return value / 1000;
  }
  if (["g", "gm", "gram", "grams", "جم", "جرام", "غرام"].includes(token)) {
    return value * 1000;
  }
  return value;
}

function extractStrengths(text: string): Strength[] {
  const strengths: Strength[] = [];
  for (const match of text.matchAll(STRENGTH_PATTERN)) {
    const value = Number(match[1].replace(",", "."));
    const kind = strengthKind(match[2]);
    if (!Number.isFinite(value) || value <= 0 || !kind) continue;
    strengths.push({
      kind,
      value: kind === "mass" ? toMilligrams(value, match[2]) : value,
      raw: match[0].trim(),
    });
  }
  return strengths;
}

function extractForms(text: string): string[] {
  const tokens = new Set(normalized(text).split(" ").filter(Boolean));
  const forms: string[] = [];
  for (const { canonical, aliases } of FORM_ALIASES) {
    if (aliases.some((alias) => tokens.has(normalized(alias)))) forms.push(canonical);
  }
  return forms;
}

function extractPack(text: string): PackSize | null {
  let count: number | null = null;
  let volumeMl: number | null = null;
  const raw: string[] = [];

  for (const match of text.matchAll(COUNT_PATTERN)) {
    const first = Number(match[1]);
    const second = match[2] ? Number(match[2]) : 1;
    if (!Number.isFinite(first) || first <= 0) continue;
    const total = first * (Number.isFinite(second) && second > 0 ? second : 1);
    count = count === null ? total : Math.max(count, total);
    raw.push(match[0].trim());
  }

  for (const match of text.matchAll(VOLUME_PATTERN)) {
    const value = Number(match[1].replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = match[2].toLowerCase();
    const millilitres = ["l", "liter", "liters", "لتر", "ليتر"].includes(unit)
      ? value * 1000
      : value;
    volumeMl = volumeMl === null ? millilitres : Math.max(volumeMl, millilitres);
    raw.push(match[0].trim());
  }

  if (count === null && volumeMl === null) return null;
  return { count, volumeMl, raw: raw.join(" · ") };
}

export function extractPharmacyAttributes(value: string): PharmacyAttributes {
  const text = toLatinDigits(value)
    .replace(/[×*]/g, "x")
    .toLowerCase();
  return {
    strengths: extractStrengths(text),
    forms: extractForms(text),
    pack: extractPack(text),
  };
}

function strengthCompatible(
  source: Strength[],
  candidate: Strength[],
): boolean {
  if (source.length === 0 || candidate.length === 0) return true;
  const kinds = new Set(source.map((item) => item.kind));
  const shared = candidate.some((item) => kinds.has(item.kind));
  if (!shared) return false;
  return source.some((left) =>
    candidate.some(
      (right) =>
        right.kind === left.kind && Math.abs(right.value - left.value) < 0.001,
    ),
  );
}

function formCompatible(source: string[], candidate: string[]): boolean {
  if (source.length === 0 || candidate.length === 0) return true;
  return source.some((form) => candidate.includes(form));
}

function packCompatible(
  source: PackSize | null,
  candidate: PackSize | null,
): boolean {
  if (!source || !candidate) return true;
  if (
    source.count !== null &&
    candidate.count !== null &&
    source.count !== candidate.count
  ) {
    return false;
  }
  if (
    source.volumeMl !== null &&
    candidate.volumeMl !== null &&
    Math.abs(source.volumeMl - candidate.volumeMl) > 0.5
  ) {
    return false;
  }
  return true;
}

/**
 * Returns the first hard conflict between a POS name and a reference name, or
 * null when the pair is safe to consider for a match.
 */
export function attributeConflict(
  source: PharmacyAttributes,
  candidate: PharmacyAttributes,
): AttributeConflict | null {
  if (!strengthCompatible(source.strengths, candidate.strengths)) {
    return {
      kind: "strength",
      detail: `${source.strengths.map((s) => s.raw).join("/")} ≠ ${candidate.strengths.map((s) => s.raw).join("/")}`,
    };
  }
  if (!formCompatible(source.forms, candidate.forms)) {
    return {
      kind: "form",
      detail: `${source.forms.join("/")} ≠ ${candidate.forms.join("/")}`,
    };
  }
  if (!packCompatible(source.pack, candidate.pack)) {
    return {
      kind: "pack",
      detail: `${source.pack?.raw ?? "—"} ≠ ${candidate.pack?.raw ?? "—"}`,
    };
  }
  return null;
}
