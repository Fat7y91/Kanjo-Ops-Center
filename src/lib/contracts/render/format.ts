/**
 * Text formatting helpers for the contract document.
 *
 * Faithful port of the V1 renderer (`functions/lib/contract.js`): Eastern
 * Arabic numerals, bidi-isolated Latin runs, HTML escaping, and the legal copy
 * normaliser. Pure functions only, so they are trivially testable.
 */

const EASTERN_ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export function toArabicNumerals(value: unknown): string {
  return String(value === null || value === undefined ? "" : value).replace(
    /[0-9]/g,
    (digit) => EASTERN_ARABIC_DIGITS[Number(digit)]!,
  );
}

/**
 * Identification numbers mix Arabic-Indic digits (bidi class AN) with hyphens;
 * a plain `isolate` still lets the bidi algorithm reverse the run, so
 * `isolate-override` forces the embedding direction.
 */
export function ltrNumber(value: string): string {
  return `<span dir="ltr" style="display: inline-block; direction: ltr; unicode-bidi: isolate-override;">${value}</span>`;
}

export function escapeHtml(value: unknown): string {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Alias used by the document builders for escaped inline text. */
export const safeString = escapeHtml;

/** Strip RTL/bidi control marks and follow-up suffixes so name matching is stable. */
export function getBaseName(name: unknown): string {
  if (!name) return "";
  let clean = String(name).replace(
    /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g,
    "",
  );
  while (clean.includes("(متابعة)") || clean.includes("(متابعه)")) {
    clean = clean
      .replace(/\s*\(متابعة\)\s*/g, "")
      .replace(/\s*\(متابعه\)\s*/g, "")
      .trim();
  }
  return clean.trim();
}

const LEGAL_DICTIONARY: Record<string, string> = {
  المالكالمكان: "المالك",
  "المالك المكان": "المالك",
  "اونر المكان": "المالك",
  "صاحب المكان": "المالك",
  "صاحب المحل": "المالك",
  اونر: "المالك",
  مانيجر: "المدير المسئول",
  "مدير المكان": "المدير المسئول",
  "مسئول المكان": "المدير المسئول",
  ديل: "اتفاق مبرم",
  دان: "تمت الموافقة",
  كنسلة: "إلغاء التعاقد",
  عربون: "دفعة مقدمة",
  كاش: "نقداً",
  لوكيشن: "الموقع الجغرافي",
  "فرع رئيسي": "المقر الرئيسي",
  "نسبة المنصة": "رسوم الخدمة",
  "ف الميه": "%",
  بالميه: "%",
};

/* Legal dictionary that normalises colloquial field wording into formal terms. */
export function sanitizeLegalText(text: unknown): string {
  if (text === null || text === undefined) return "";
  let cleaned = String(text).trim();
  const wordChars = "A-Za-z0-9_\\u0600-\\u06FF";
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const key in LEGAL_DICTIONARY) {
    const escaped = escapeRegex(key);
    let pattern: string;
    if (/\s/.test(key)) {
      pattern = escaped;
    } else if (key.startsWith("ال")) {
      pattern = `(?<![${wordChars}])${escaped}(?![${wordChars}])`;
    } else {
      pattern = `(?<![${wordChars}])(?:ال)?${escaped}(?![${wordChars}])`;
    }
    cleaned = cleaned.replace(new RegExp(pattern, "gi"), LEGAL_DICTIONARY[key]!);
  }
  return cleaned.replace(/\s{2,}/g, " ").trim();
}
