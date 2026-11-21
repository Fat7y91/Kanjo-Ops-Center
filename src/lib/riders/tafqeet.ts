const ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
] as const;

const TEENS = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
] as const;

const TENS = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
] as const;

const HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
] as const;

function joinArabic(parts: readonly string[]): string {
  return parts.filter(Boolean).join(" و");
}

function threeDigitWords(value: number, construct = false): string {
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  const parts: string[] = [];

  if (hundreds > 0) {
    parts.push(
      hundreds === 2 && construct && remainder === 0
        ? "مائتا"
        : HUNDREDS[hundreds],
    );
  }

  if (remainder > 0) {
    if (remainder < 10) {
      parts.push(ONES[remainder]);
    } else if (remainder < 20) {
      parts.push(TEENS[remainder - 10]);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(ones > 0 ? `${ONES[ones]} و${TENS[tens]}` : TENS[tens]);
    }
  }

  return joinArabic(parts);
}

function scaleWords(
  value: number,
  singular: string,
  dual: string,
  plural: string,
): string {
  if (value === 1) return singular;
  if (value === 2) return dual;
  if (value <= 10) return `${threeDigitWords(value)} ${plural}`;
  if (value < 100) return `${threeDigitWords(value)} ${singular}`;
  return `${threeDigitWords(value, true)} ${singular}`;
}

function groupWords(value: number, scale: number): string {
  if (value <= 0) return "";
  if (scale === 0) return threeDigitWords(value);
  if (scale === 1) return scaleWords(value, "ألف", "ألفان", "آلاف");
  if (scale === 2) return scaleWords(value, "مليون", "مليونان", "ملايين");
  return scaleWords(value, "مليار", "ملياران", "مليارات");
}

export function intToArabicWords(value: number): string {
  if (!Number.isFinite(value)) return "صفر";
  const total = Math.max(0, Math.min(999_999_999_999, Math.trunc(value)));
  if (total === 0) return "صفر";

  const billions = Math.floor(total / 1_000_000_000);
  const millions = Math.floor(total / 1_000_000) % 1000;
  const thousands = Math.floor(total / 1000) % 1000;
  const units = total % 1000;

  return joinArabic([
    groupWords(billions, 3),
    groupWords(millions, 2),
    groupWords(thousands, 1),
    groupWords(units, 0),
  ]);
}

function currencyPhrase(
  value: number,
  singular: string,
  dual: string,
  plural: string,
): string {
  if (value === 0) return `صفر ${singular}`;
  if (value === 1) return `${singular} واحد`;
  if (value === 2) return dual;
  if (value <= 10) return `${intToArabicWords(value)} ${plural}`;
  return `${intToArabicWords(value)} ${singular}`;
}

export function tafqeetEGP(amount: number): string {
  const safe = Number.isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 0;
  const totalPiastres = Math.round(safe * 100);
  const pounds = Math.floor(totalPiastres / 100);
  const piastres = totalPiastres % 100;

  const poundsText = currencyPhrase(pounds, "جنيه", "جنيهان", "جنيهات");
  if (piastres === 0) return `${poundsText} لا غير`;

  const piastresText = currencyPhrase(piastres, "قرش", "قرشان", "قروش");
  return `${poundsText} و${piastresText} لا غير`;
}
