/**
 * Hardcoded legal identity and classification constants for the contract
 * document. These are not editable from the UI: legal copy and the first-party
 * registration data are fixed by the business, matching V1
 * (`functions/lib/contract.js`).
 */

export const KANJO_FIRST_PARTY = {
  tradeName:
    "شركة كاند جوو لخدمات التوصيل والتجاره الالكترونيه (شركة ذات مسئولية محدودة)",
  commercialRegister: "٣٠٨٢٣٤",
  commercialRegisterOffice: "استثمار القاهرة",
  taxCard: "٧٨٣-٤١٠-٨٥٩",
  taxOffice: "مأمورية ضرائب الشركات المساهمة بالقاهرة",
  address:
    "شارع درب الجرن من شارع المديرية، قسم أول طنطا، محافظة الغربية",
} as const;

export const CONTRACT_PLACEHOLDER_CATS = ["متابعة", "متابعه"] as const;

export const CONTRACT_BUSINESS_TYPES: Record<string, string> = {
  مطاعم: "مطعم",
  كافيهات: "مطعم",
  "سوبر ماركت": "سوبر ماركت",
  صيدليات: "صيدلية",
  "عناية شخصية": "متجر عناية شخصية",
  كوزماتكس: "متجر كوزماتكس",
  أسماك: "محل أسماك",
  جزارة: "محل جزارة",
  خضار: "متجر خضار وفاكهة",
  دواجن: "متجر دواجن",
  عصائر: "محل",
  مخبوزات: "مخبز",
  مسليات: "متجر مسليات",
  حلويات: "متجر حلويات",
  عطارة: "متجر عطارة",
  لبنة: "متجر منتجات ألبان",
  "أدوات كهربائية": "متجر أدوات كهربائية",
  "أدوات نظافة": "متجر أدوات نظافة",
  إكسسوارات: "متجر إكسسوارات",
  "بيع جملة": "مركز بيع جملة",
  سباكة: "متجر سباكة",
  صيانة: "مقدم خدمات صيانة",
  "فني كهرباء": "مقدم خدمات كهرباء",
  كنترول: "متجر كنترول وألعاب",
  "لعب أطفال": "متجر لعب أطفال",
  "مستلزمات المطبخ": "متجر مستلزمات مطبخ",
  "مستلزمات الحيوانات": "متجر مستلزمات حيوانات",
  مفروشات: "متجر مفروشات",
  مكتبات: "مكتبة",
  "ملابس وأدوات رياضية": "متجر ملابس وأدوات رياضية",
  منظفات: "متجر منظفات",
  هدايا: "متجر هدايا",
  ورود: "متجر ورود",
  "أطقم صيني": "متجر أطقم صيني",
};

export const ARABIC_CLAUSE_NUMBERS = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
  "الحادي عشر",
  "الثاني عشر",
  "الثالث عشر",
  "الرابع عشر",
  "الخامس عشر",
  "السادس عشر",
  "السابع عشر",
  "الثامن عشر",
  "التاسع عشر",
  "العشرون",
] as const;

export const FOOD_PREP_KEYWORDS = [
  "مطاعم",
  "كافيه",
  "عصائر",
  "مخبوزات",
  "حلويات",
  "أسماك",
  "جزارة",
  "دواجن",
] as const;

/* Strict, hardcoded, non-editable merchant exceptions. */
export const FINANCIAL_EXCEPTION_MERCHANT = "سفير السعادة";

/* Court jurisdiction for the butcher "الحيطاوى" (serial #1014). Matched by the
 * immutable merchant id because two near-identical names exist in live data. */
export const DESOUK_MERCHANT_IDS = ["KJ-N3K4DG"] as const;

const MEDICAL_CATEGORY_KEYWORDS = ["صيدليات", "كوزماتكس", "عناية شخصية"] as const;

export function isRestaurantCafeCategoryExact(cat: unknown): boolean {
  const value = String(cat ?? "").trim();
  return value === "مطاعم وكافيهات" || value.endsWith("مطاعم وكافيهات");
}

export function isMedicalCategory(cat: unknown): boolean {
  return MEDICAL_CATEGORY_KEYWORDS.some((key) => String(cat ?? "").includes(key));
}

export function resolveBusinessType(
  category: unknown,
  explicitType: unknown,
): string {
  const cat = String(category ?? "");
  const explicit = String(explicitType ?? "").trim();
  if (
    explicit &&
    !CONTRACT_PLACEHOLDER_CATS.includes(
      explicit as (typeof CONTRACT_PLACEHOLDER_CATS)[number],
    )
  ) {
    return explicit;
  }
  for (const key in CONTRACT_BUSINESS_TYPES) {
    if (cat.includes(key)) return CONTRACT_BUSINESS_TYPES[key]!;
  }
  return "منشأة";
}
