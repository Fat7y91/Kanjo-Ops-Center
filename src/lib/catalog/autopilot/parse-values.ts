import { normalizeSearchText } from "@/lib/search/normalize";

const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

export function toLatinDigits(value: string): string {
  return value.replace(ARABIC_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** Plain display text for a sheet cell, without locale/scientific formatting. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** Display-safe cell text: controls removed, whitespace collapsed, trimmed. */
export function cleanCellText(value: unknown): string {
  return cellText(value)
    .replace(/\\[nrt]/gi, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Expands a numeric/cientific barcode into exact digits without exponent. */
export function expandInteger(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > 1e15) return "";
    return Math.trunc(value).toFixed(0);
  }
  const text = toLatinDigits(cellText(value)).trim();
  if (!text) return "";
  if (/^\d+(\.0+)?$/.test(text)) return text.replace(/\.0+$/, "");
  if (/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) && Math.abs(numeric) <= 1e15
      ? Math.trunc(numeric).toFixed(0)
      : "";
  }
  return "";
}

/**
 * EAN/UPC-style barcode as exact digits. Returns "" when the cell does not hold
 * a plausible retail barcode, so a product name is never mistaken for one.
 */
export function parseBarcode(value: unknown): string {
  const digits = expandInteger(value);
  if (digits.length >= 8 && digits.length <= 14) return digits;
  return "";
}

export function looksLikeBarcode(value: unknown): boolean {
  return parseBarcode(value).length >= 8;
}

/**
 * Parses a sheet price into minor units. Accepts Arabic-Indic digits, currency
 * words, thousands separators and both decimal separator conventions.
 */
export function parsePriceMinor(value: unknown): number | null {
  let raw = toLatinDigits(cellText(value)).trim();
  if (!raw) return null;

  raw = raw
    .replace(/\u066B/g, ".")
    .replace(/\u066C/g, "")
    .replace(/ج\.\s*م|جنيه|EGP|ريال|LE\b/gi, "")
    .replace(/[£$€]/g, "")
    .replace(/\s+/g, "");
  if (!raw || !/\d/.test(raw)) return null;
  // Names like "جبنة 1" also contain digits; a price never carries letters.
  if (/\p{L}/u.test(raw)) return null;

  // A bare 8-14 digit integer is far more likely a barcode than a price.
  if (/^\d{8,14}$/.test(raw)) return null;

  const negative = raw.startsWith("-") || /^\(.*\)$/.test(raw);
  raw = raw.replace(/[()]/g, "").replace(/^-/, "");

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma !== -1 && dot !== -1) {
    if (comma > dot) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (comma !== -1) {
    const parts = raw.split(",");
    const decimalComma =
      parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2;
    raw = decimalComma ? `${parts[0]}.${parts[1]}` : raw.replace(/,/g, "");
  }

  raw = raw.replace(/[^\d.]/g, "");
  if ((raw.match(/\./g) ?? []).length > 1) {
    const last = raw.lastIndexOf(".");
    raw = `${raw.slice(0, last).replace(/\./g, "")}${raw.slice(last)}`;
  }

  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0 || price > 100_000_000) {
    return null;
  }
  if (negative) return null;

  const minor = Math.round(price * 100);
  return minor > 0 ? minor : null;
}

const UNIT_PATTERN =
  /^(?:قطعة|قطع|حبة|حبه|كجم|كيلو|كيلوجرام|جرام|جم|لتر|مل|علبة|علبه|كيس|شريط|باكت|كرتونة|كرتونه|دستة|دسته|ك\s*\*\s*\d+|\d+\s*(?:جم|جرام|كجم|لتر|مل|قطعة|كيس|علبة))$/i;

export function parseUnit(value: unknown): string {
  const text = cleanCellText(value);
  return text.length <= 40 ? text : text.slice(0, 40);
}

export function looksLikeUnit(value: unknown): boolean {
  const text = cleanCellText(value);
  return text.length > 0 && text.length <= 24 && UNIT_PATTERN.test(text);
}

const MAX_QUANTITY = 10_000_000;

/**
 * Remaining stock as a non-negative integer. Accepts Arabic-Indic digits and a
 * harmless `.0` suffix, and rejects anything with letters or a sign so a price
 * or barcode is never mistaken for stock.
 */
export function parseQuantity(value: unknown): number | null {
  const text = toLatinDigits(cellText(value))
    .replace(/[\s,]/g, "")
    .trim();
  if (!text || !/^\d+(?:\.0+)?$/.test(text)) return null;
  const quantity = Number(text);
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
    return null;
  }
  return quantity;
}

/** True for a short integer cell, used to spot a stock column without a header. */
export function looksLikeQuantity(value: unknown): boolean {
  const quantity = parseQuantity(value);
  return quantity !== null && quantity <= 9999;
}


const SUMMARY_PATTERNS = [
  "اجمالى الموقع",
  "اجمالي الموقع",
  "الصفحه",
  "الصفحه",
  "طبعت بواسطة",
  "طبعت بواسطه",
  "printed by",
  "page ",
  "grand total",
  "الاجمالي",
  "الاجمالى",
  "اجمالى الفاتورة",
  "اجمالي الفاتورة",
  "عدد الاصناف",
  "عدد الاصناف",
];

export function isSummaryRow(values: unknown[]): boolean {
  const text = normalizeSearchText(values.map(cleanCellText).join(" "));
  if (!text) return false;
  return SUMMARY_PATTERNS.some((pattern) =>
    text.includes(normalizeSearchText(pattern)),
  );
}

const HEADER_WORDS = [
  "اسم الصنف",
  "اسم المنتج",
  "الصنف",
  "المنتج",
  "الباركود",
  "باركود",
  "الوحده",
  "الوحدة",
  "سعر البيع",
  "متوسط سعر البيع",
  "السعر",
  "item",
  "product",
  "price",
  "barcode",
  "unit",
  "sku",
];

export function looksLikeHeaderRow(values: unknown[]): boolean {
  const cells = values.map((value) => normalizeSearchText(cleanCellText(value)));
  return cells.some((cell) =>
    cell.length > 0 && HEADER_WORDS.some((word) => cell.includes(normalizeSearchText(word))),
  );
}
