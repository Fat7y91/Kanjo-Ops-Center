/**
 * AUTO-GENERATED from the central dashboard taxonomy
 * (public/js/config/qemaTaxonomy.js). Do not edit by hand.
 *
 * Numeric IDs are the Dashboard contract: vendor type 3 is Pharmacy, category
 * IDs are scoped per vendor type (the same category ID may appear under two
 * vendor scopes), and variant option aliases share one dashboard option ID.
 */

import type {
  TaxonomyCategorySeed,
  TaxonomyVariantSeed,
  TaxonomyVendorTypeSeed,
} from "@/lib/taxonomy/types";

export const VENDOR_TYPE_SEED: TaxonomyVendorTypeSeed[] = [
  {
    "id": 1,
    "name_ar": "مطعم",
    "name_en": "Restaurant"
  },
  {
    "id": 2,
    "name_ar": "قهوة وعصاير",
    "name_en": "Cafe & Juice"
  },
  {
    "id": 3,
    "name_ar": "صيدلية",
    "name_en": "Pharmacy"
  },
  {
    "id": 4,
    "name_ar": "سوبر ماركت",
    "name_en": "Supermarket"
  },
  {
    "id": 5,
    "name_ar": "الحلو",
    "name_en": "Desserts"
  },
  {
    "id": 6,
    "name_ar": "مخبز",
    "name_en": "Bakery"
  },
  {
    "id": 7,
    "name_ar": "جزارة ودواجن وأسماك",
    "name_en": "Butchery, Poultry & Fish"
  },
  {
    "id": 8,
    "name_ar": "خضار وفاكهة",
    "name_en": "Produce"
  },
  {
    "id": 9,
    "name_ar": "محمصة وعطارة",
    "name_en": "Roastery & Spices"
  },
  {
    "id": 10,
    "name_ar": "مكتبات وهدايا",
    "name_en": "Stationery & Gifts"
  },
  {
    "id": 11,
    "name_ar": "ادوية بيطرية",
    "name_en": "Veterinary Supplies"
  },
  {
    "id": 12,
    "name_ar": "أدوات كهربائية",
    "name_en": "Electrical Supplies"
  },
  {
    "id": 13,
    "name_ar": "مستحضرات التجميل",
    "name_en": "Cosmetics"
  },
  {
    "id": 14,
    "name_ar": "منظفات",
    "name_en": "Cleaning Supplies"
  },
  {
    "id": 15,
    "name_ar": "موبايلات واكسسوارات",
    "name_en": "Mobile & Accessories"
  }
];

export const CATEGORY_SEED: TaxonomyCategorySeed[] = [
  {
    "id": 175,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "أم علي",
    "name_en": "Om Ali",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 173,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "بان كيك",
    "name_en": "Pancakes",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 170,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "زلابيا",
    "name_en": "Zalabia",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 169,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "سينابون",
    "name_en": "Cinnamon Rolls",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 171,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "طواجن",
    "name_en": "Tagen",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 168,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "فريسكا",
    "name_en": "Freska",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 166,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "كريب",
    "name_en": "Crepe",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 174,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "كيك",
    "name_en": "Cake",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 176,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "مشروبات",
    "name_en": "Beverages",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 184,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "آيس كوفي",
    "name_en": "Iced Coffee",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 178,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "بوبا",
    "name_en": "Boba",
    "sort_order": 11,
    "active": true
  },
  {
    "id": 179,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "زبادو",
    "name_en": "Zabado",
    "sort_order": 12,
    "active": true
  },
  {
    "id": 180,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "سموذي",
    "name_en": "Smoothie",
    "sort_order": 13,
    "active": true
  },
  {
    "id": 187,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "صودا",
    "name_en": "Soda",
    "sort_order": 14,
    "active": true
  },
  {
    "id": 183,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "عصير",
    "name_en": "Juice",
    "sort_order": 15,
    "active": true
  },
  {
    "id": 185,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "فرابيه",
    "name_en": "Frappe",
    "sort_order": 16,
    "active": true
  },
  {
    "id": 177,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "ماتشا",
    "name_en": "Matcha",
    "sort_order": 17,
    "active": true
  },
  {
    "id": 186,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "ميلك شيك",
    "name_en": "Milkshake",
    "sort_order": 18,
    "active": true
  },
  {
    "id": 167,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "مولتن",
    "name_en": "Molten",
    "sort_order": 19,
    "active": true
  },
  {
    "id": 172,
    "vendor_type_id": 5,
    "parent_id": null,
    "name_ar": "وافل",
    "name_en": "Waffle",
    "sort_order": 20,
    "active": true
  },
  {
    "id": 149,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "إضافات",
    "name_en": "Extras",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 163,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "اللمة",
    "name_en": "Family Meal",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 12,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "برجر",
    "name_en": "Burger",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 165,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "بطاطس",
    "name_en": "Fries",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 148,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "بيتي",
    "name_en": "Pita",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 150,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "طواجن",
    "name_en": "Tagen",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 152,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "عروض",
    "name_en": "Offers",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 164,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "فراخ",
    "name_en": "Chicken",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 161,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "فطائر",
    "name_en": "Pies",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 8,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "كرسبي",
    "name_en": "Crispy",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 151,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "كشري",
    "name_en": "Koshary",
    "sort_order": 11,
    "active": true
  },
  {
    "id": 162,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "مشروبات",
    "name_en": "Beverages",
    "sort_order": 12,
    "active": true
  },
  {
    "id": 147,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "مقبلات",
    "name_en": "Appetizers",
    "sort_order": 13,
    "active": true
  },
  {
    "id": 9,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "مشويات",
    "name_en": "Grills",
    "sort_order": 14,
    "active": true
  },
  {
    "id": 10,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "أسماك",
    "name_en": "Fish",
    "sort_order": 15,
    "active": true
  },
  {
    "id": 7,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "حواوشي",
    "name_en": "Hawawshi",
    "sort_order": 16,
    "active": true
  },
  {
    "id": 11,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "مصري",
    "name_en": "Egyptian",
    "sort_order": 17,
    "active": true
  },
  {
    "id": 15,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "بيتزا",
    "name_en": "Pizza",
    "sort_order": 18,
    "active": true
  },
  {
    "id": 14,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "شاورما",
    "name_en": "Shawarma",
    "sort_order": 19,
    "active": true
  },
  {
    "id": 4,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "ساندوتشات",
    "name_en": "Sandwiches",
    "sort_order": 20,
    "active": true
  },
  {
    "id": 1,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "باستا",
    "name_en": "Pasta",
    "sort_order": 21,
    "active": true
  },
  {
    "id": 13,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "كريب",
    "name_en": "Crepe",
    "sort_order": 22,
    "active": true
  },
  {
    "id": 16,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "سلطات",
    "name_en": "Salads",
    "sort_order": 23,
    "active": true
  },
  {
    "id": 37,
    "vendor_type_id": 1,
    "parent_id": null,
    "name_ar": "حلويات",
    "name_en": "Desserts",
    "sort_order": 24,
    "active": true
  },
  {
    "id": 156,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "كيك",
    "name_en": "Cake",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 157,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "وافل",
    "name_en": "Waffle",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 40,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "قهوة",
    "name_en": "Coffee",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 41,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "باردة",
    "name_en": "Cold",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 42,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "فريش",
    "name_en": "Fresh",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 43,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "الساخن",
    "name_en": "Hot",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 186,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "ميلك شيك",
    "name_en": "Milkshake",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 45,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "سموزي",
    "name_en": "Smoothie",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 46,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "كوكتيل",
    "name_en": "Cocktail",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 47,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "حلويات",
    "name_en": "Desserts",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 187,
    "vendor_type_id": 2,
    "parent_id": null,
    "name_ar": "صودا",
    "name_en": "Soda",
    "sort_order": 11,
    "active": true
  },
  {
    "id": 160,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "تمور",
    "name_en": "Dates",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 128,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "مكسرات",
    "name_en": "Nuts",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 129,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "محمص",
    "name_en": "Roasted",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 130,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "التسالي",
    "name_en": "Snacks",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 131,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "البهارات",
    "name_en": "Spices",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 132,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "الأعشاب",
    "name_en": "Herbs",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 133,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "البقوليات",
    "name_en": "Legumes",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 134,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "العسل",
    "name_en": "Honey",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 135,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "مجفف",
    "name_en": "Dried",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 136,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "القهوة",
    "name_en": "",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 137,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "السناكس",
    "name_en": "",
    "sort_order": 11,
    "active": true
  },
  {
    "id": 138,
    "vendor_type_id": 9,
    "parent_id": null,
    "name_ar": "الخلطات",
    "name_en": "Blends",
    "sort_order": 12,
    "active": true
  },
  {
    "id": 159,
    "vendor_type_id": 8,
    "parent_id": null,
    "name_ar": "تمور",
    "name_en": "Dates",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 139,
    "vendor_type_id": 8,
    "parent_id": null,
    "name_ar": "الخضار",
    "name_en": "Vegetables",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 140,
    "vendor_type_id": 8,
    "parent_id": null,
    "name_ar": "خضرة",
    "name_en": "Greens",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 141,
    "vendor_type_id": 8,
    "parent_id": null,
    "name_ar": "للطبخ",
    "name_en": "Cooking",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 142,
    "vendor_type_id": 8,
    "parent_id": null,
    "name_ar": "الفاكهة",
    "name_en": "Fruit",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 143,
    "vendor_type_id": 8,
    "parent_id": null,
    "name_ar": "الموسمية",
    "name_en": "Seasonal",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 146,
    "vendor_type_id": 8,
    "parent_id": null,
    "name_ar": "عضوي",
    "name_en": "Organic",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 144,
    "vendor_type_id": 8,
    "parent_id": null,
    "name_ar": "مستوردة",
    "name_en": "Imported",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 145,
    "vendor_type_id": 8,
    "parent_id": null,
    "name_ar": "مجهزة",
    "name_en": "Prepared",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 153,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "مجمدات",
    "name_en": "Frozen",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 28,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "توفير",
    "name_en": "Value",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 32,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "بقالة",
    "name_en": "",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 29,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "ثلاجة",
    "name_en": "Chilled",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 33,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "تسالي",
    "name_en": "Snacks",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 31,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "لحوم",
    "name_en": "Meat",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 38,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "طازج",
    "name_en": "Fresh",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 34,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "مشروبات",
    "name_en": "Beverages",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 35,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "منظفات",
    "name_en": "",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 30,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "مخبوزات",
    "name_en": "Bakery",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 36,
    "vendor_type_id": 4,
    "parent_id": null,
    "name_ar": "ورقيات",
    "name_en": "Leafy",
    "sort_order": 11,
    "active": true
  },
  {
    "id": 48,
    "vendor_type_id": 6,
    "parent_id": null,
    "name_ar": "الخبز",
    "name_en": "Bread",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 49,
    "vendor_type_id": 6,
    "parent_id": null,
    "name_ar": "المعجنات",
    "name_en": "Pastries",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 50,
    "vendor_type_id": 6,
    "parent_id": null,
    "name_ar": "الفطائر",
    "name_en": "",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 51,
    "vendor_type_id": 6,
    "parent_id": null,
    "name_ar": "حلويات",
    "name_en": "Desserts",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 52,
    "vendor_type_id": 6,
    "parent_id": null,
    "name_ar": "كيك",
    "name_en": "Cake",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 53,
    "vendor_type_id": 6,
    "parent_id": null,
    "name_ar": "بسكوت",
    "name_en": "Biscuits",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 54,
    "vendor_type_id": 6,
    "parent_id": null,
    "name_ar": "ساندوتشات",
    "name_en": "Sandwiches",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 55,
    "vendor_type_id": 6,
    "parent_id": null,
    "name_ar": "شرقي",
    "name_en": "Oriental",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 56,
    "vendor_type_id": 6,
    "parent_id": null,
    "name_ar": "صحي",
    "name_en": "Healthy",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 18,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "مسكنات",
    "name_en": "Painkillers",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 20,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "مزمنة",
    "name_en": "Chronic Care",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 24,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "الأطفال",
    "name_en": "Pediatrics",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 155,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "حفاضات",
    "name_en": "Diapers",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 27,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "المرأة",
    "name_en": "Women's Care",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 23,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "الشخصية",
    "name_en": "Personal Care",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 25,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "فيتامينات",
    "name_en": "Vitamins",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 21,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "البشرة",
    "name_en": "Skin Care",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 22,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "الشعر",
    "name_en": "Hair Care",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 26,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "مستلزمات",
    "name_en": "Supplies",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 39,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "الأم",
    "name_en": "Mother Care",
    "sort_order": 11,
    "active": true
  },
  {
    "id": 19,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "المناعة",
    "name_en": "Immunity",
    "sort_order": 12,
    "active": true
  },
  {
    "id": 194,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "أدوية",
    "name_en": "Medicines",
    "sort_order": 13,
    "active": true
  },
  {
    "id": 195,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "برد",
    "name_en": "Cold & Flu",
    "sort_order": 14,
    "active": true
  },
  {
    "id": 196,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "معدة",
    "name_en": "Digestive",
    "sort_order": 15,
    "active": true
  },
  {
    "id": 197,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "مضادات",
    "name_en": "Antibiotics",
    "sort_order": 16,
    "active": true
  },
  {
    "id": 198,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "حساسية",
    "name_en": "Allergy",
    "sort_order": 17,
    "active": true
  },
  {
    "id": 199,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "قطرات",
    "name_en": "Drops",
    "sort_order": 18,
    "active": true
  },
  {
    "id": 200,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "أسنان",
    "name_en": "Dental",
    "sort_order": 19,
    "active": true
  },
  {
    "id": 201,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "مزيلات",
    "name_en": "Deodorants",
    "sort_order": 20,
    "active": true
  },
  {
    "id": 202,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "حلاقة",
    "name_en": "Shaving",
    "sort_order": 21,
    "active": true
  },
  {
    "id": 203,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "مطهرات",
    "name_en": "Disinfectants",
    "sort_order": 22,
    "active": true
  },
  {
    "id": 204,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "معطرات",
    "name_en": "Fragrances",
    "sort_order": 23,
    "active": true
  },
  {
    "id": 205,
    "vendor_type_id": 3,
    "parent_id": null,
    "name_ar": "مبيدات",
    "name_en": "Pesticides",
    "sort_order": 24,
    "active": true
  },
  {
    "id": 57,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "مدرسية",
    "name_en": "School Supplies",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 58,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "مكتبية",
    "name_en": "Office Supplies",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 59,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "الرسم",
    "name_en": "Art Supplies",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 60,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "اكسسوارات",
    "name_en": "Accessories",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 61,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "المناسبات",
    "name_en": "Occasions",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 62,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "نسائية",
    "name_en": "Women",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 63,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "رجالية",
    "name_en": "Men",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 65,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "أطفال",
    "name_en": "",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 66,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "بوكسات",
    "name_en": "Gift Boxes",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 67,
    "vendor_type_id": 10,
    "parent_id": null,
    "name_ar": "منزلية",
    "name_en": "Home",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 118,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "الأدوية",
    "name_en": "Veterinary Medicines",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 119,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "الحشرات",
    "name_en": "Pest Control",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 120,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "كلاب",
    "name_en": "Dogs",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 121,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "قطط",
    "name_en": "Cats",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 122,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "الطيور",
    "name_en": "Birds",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 123,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "أعلاف",
    "name_en": "Feed",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 124,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "العناية",
    "name_en": "Care",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 125,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "مستلزمات",
    "name_en": "Supplies",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 126,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "سبلايز",
    "name_en": "Supplies",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 127,
    "vendor_type_id": 11,
    "parent_id": null,
    "name_ar": "المزارع",
    "name_en": "Farms",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 100,
    "vendor_type_id": 12,
    "parent_id": null,
    "name_ar": "الإضاءة",
    "name_en": "Lighting",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 101,
    "vendor_type_id": 12,
    "parent_id": null,
    "name_ar": "المشترك",
    "name_en": "Power Strips",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 102,
    "vendor_type_id": 12,
    "parent_id": null,
    "name_ar": "البطاريات",
    "name_en": "Batteries",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 103,
    "vendor_type_id": 12,
    "parent_id": null,
    "name_ar": "الأدوات",
    "name_en": "Tools",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 104,
    "vendor_type_id": 12,
    "parent_id": null,
    "name_ar": "مستلزمات",
    "name_en": "Supplies",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 105,
    "vendor_type_id": 12,
    "parent_id": null,
    "name_ar": "الأجهزة",
    "name_en": "Devices",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 106,
    "vendor_type_id": 12,
    "parent_id": null,
    "name_ar": "للسيارات",
    "name_en": "Car Accessories",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 107,
    "vendor_type_id": 12,
    "parent_id": null,
    "name_ar": "كشافات",
    "name_en": "Flashlights",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 79,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "لحوم",
    "name_en": "Meat",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 80,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "قطعيات",
    "name_en": "Cuts",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 81,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "مجهزة",
    "name_en": "Prepared",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 82,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "حلويات",
    "name_en": "Desserts",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 83,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "فراخ",
    "name_en": "Chicken",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 85,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "متبل",
    "name_en": "Marinated",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 86,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "طيور",
    "name_en": "Poultry",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 87,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "أسماك",
    "name_en": "Fish",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 88,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "فيليه",
    "name_en": "Fillet",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 89,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "سي فود",
    "name_en": "Seafood",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 91,
    "vendor_type_id": 7,
    "parent_id": null,
    "name_ar": "مجمدات",
    "name_en": "Frozen",
    "sort_order": 11,
    "active": true
  },
  {
    "id": 108,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "ماكياج",
    "name_en": "Makeup",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 109,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "البشرة",
    "name_en": "Skin Care",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 110,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "الشعر",
    "name_en": "Hair Care",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 111,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "الأظافر",
    "name_en": "Nails",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 112,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "العطور",
    "name_en": "Perfumes",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 113,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "الجسم",
    "name_en": "Body",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 114,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "رموش",
    "name_en": "Lashes",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 115,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "مستلزمات",
    "name_en": "Supplies",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 116,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "الشفاه",
    "name_en": "Lips",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 117,
    "vendor_type_id": 13,
    "parent_id": null,
    "name_ar": "بوكسات",
    "name_en": "Gift Boxes",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 92,
    "vendor_type_id": 14,
    "parent_id": null,
    "name_ar": "الملابس",
    "name_en": "Laundry",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 93,
    "vendor_type_id": 14,
    "parent_id": null,
    "name_ar": "المطبخ",
    "name_en": "Kitchen",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 94,
    "vendor_type_id": 14,
    "parent_id": null,
    "name_ar": "الحمام",
    "name_en": "Bathroom",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 95,
    "vendor_type_id": 14,
    "parent_id": null,
    "name_ar": "الأسطح",
    "name_en": "Surfaces",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 96,
    "vendor_type_id": 14,
    "parent_id": null,
    "name_ar": "معطرات",
    "name_en": "Fragrances",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 97,
    "vendor_type_id": 14,
    "parent_id": null,
    "name_ar": "مستلزمات",
    "name_en": "Supplies",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 98,
    "vendor_type_id": 14,
    "parent_id": null,
    "name_ar": "العشرات",
    "name_en": "Household",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 99,
    "vendor_type_id": 14,
    "parent_id": null,
    "name_ar": "الأطفال",
    "name_en": "Pediatrics",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 158,
    "vendor_type_id": 14,
    "parent_id": null,
    "name_ar": "حفاضات",
    "name_en": "Diapers",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 68,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "موبايلات",
    "name_en": "Mobiles",
    "sort_order": 1,
    "active": true
  },
  {
    "id": 69,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "جرابات",
    "name_en": "Cases",
    "sort_order": 2,
    "active": true
  },
  {
    "id": 70,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "شواحن",
    "name_en": "Chargers",
    "sort_order": 3,
    "active": true
  },
  {
    "id": 71,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "باوربانك",
    "name_en": "Power Banks",
    "sort_order": 4,
    "active": true
  },
  {
    "id": 72,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "سماعات",
    "name_en": "Headphones",
    "sort_order": 5,
    "active": true
  },
  {
    "id": 73,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "للسيارات",
    "name_en": "Car Accessories",
    "sort_order": 6,
    "active": true
  },
  {
    "id": 74,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "سمارت",
    "name_en": "Smart Devices",
    "sort_order": 7,
    "active": true
  },
  {
    "id": 75,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "اكسسوارات",
    "name_en": "Accessories",
    "sort_order": 8,
    "active": true
  },
  {
    "id": 76,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "التصوير",
    "name_en": "Photography",
    "sort_order": 9,
    "active": true
  },
  {
    "id": 77,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "جيمنج",
    "name_en": "Gaming",
    "sort_order": 10,
    "active": true
  },
  {
    "id": 78,
    "vendor_type_id": 15,
    "parent_id": null,
    "name_ar": "مستلزمات",
    "name_en": "Supplies",
    "sort_order": 11,
    "active": true
  }
];

export const VARIANT_SEED: TaxonomyVariantSeed[] = [
  {
    "variant_id": 1,
    "name_ar": "الحجم",
    "name_en": "Size",
    "options": [
      {
        "option_id": 1,
        "option_name_ar": "صغير",
        "option_name_en": "Small",
        "aliases": []
      },
      {
        "option_id": 2,
        "option_name_ar": "وسط",
        "option_name_en": "Medium",
        "aliases": []
      },
      {
        "option_id": 3,
        "option_name_ar": "كبير",
        "option_name_en": "Large",
        "aliases": []
      },
      {
        "option_id": 4,
        "option_name_ar": "جامبو",
        "option_name_en": "Jumbo",
        "aliases": []
      },
      {
        "option_id": 5,
        "option_name_ar": "صاروخ",
        "option_name_en": "Rocket",
        "aliases": []
      },
      {
        "option_id": 6,
        "option_name_ar": "شرقي",
        "option_name_en": "Oriental",
        "aliases": []
      },
      {
        "option_id": 48,
        "option_name_ar": "سنجل",
        "option_name_en": "Single",
        "aliases": []
      },
      {
        "option_id": 49,
        "option_name_ar": "عائلي",
        "option_name_en": "Family",
        "aliases": []
      },
      {
        "option_id": 50,
        "option_name_ar": "دبل",
        "option_name_en": "Double",
        "aliases": [
          "دوبل",
          "دابل",
          "double",
          "dbl"
        ]
      },
      {
        "option_id": 51,
        "option_name_ar": "اكس لارج",
        "option_name_en": "X-Large",
        "aliases": []
      },
      {
        "option_id": 56,
        "option_name_ar": "دبل لارج",
        "option_name_en": "Double Large",
        "aliases": []
      },
      {
        "option_id": 70,
        "option_name_ar": "تريبل",
        "option_name_en": "Triple",
        "aliases": [
          "تربل",
          "ترابل",
          "triple"
        ]
      }
    ]
  },
  {
    "variant_id": 2,
    "name_ar": "الطعم",
    "name_en": "Taste",
    "options": [
      {
        "option_id": 7,
        "option_name_ar": "عادي",
        "option_name_en": "Regular",
        "aliases": []
      },
      {
        "option_id": 8,
        "option_name_ar": "حار",
        "option_name_en": "Spicy",
        "aliases": []
      }
    ]
  },
  {
    "variant_id": 3,
    "name_ar": "نوع العيش",
    "name_en": "Bread Type",
    "options": [
      {
        "option_id": 9,
        "option_name_ar": "عيش سوري",
        "option_name_en": "Syrian Bread",
        "aliases": []
      },
      {
        "option_id": 10,
        "option_name_ar": "عيش فينو",
        "option_name_en": "Fino Bread",
        "aliases": []
      },
      {
        "option_id": 44,
        "option_name_ar": "بلدي",
        "option_name_en": "Baladi",
        "aliases": []
      },
      {
        "option_id": 45,
        "option_name_ar": "فرنساوي",
        "option_name_en": "French",
        "aliases": []
      },
      {
        "option_id": 46,
        "option_name_ar": "كيزر",
        "option_name_en": "Kaiser",
        "aliases": []
      },
      {
        "option_id": 47,
        "option_name_ar": "سادة",
        "option_name_en": "Plain",
        "aliases": []
      },
      {
        "option_id": 68,
        "option_name_ar": "وش بيتزا",
        "option_name_en": "Pizza Base",
        "aliases": []
      }
    ]
  },
  {
    "variant_id": 4,
    "name_ar": "الصوص",
    "name_en": "Sauce",
    "options": [
      {
        "option_id": 11,
        "option_name_ar": "صوص أحمر",
        "option_name_en": "Red Sauce",
        "aliases": []
      },
      {
        "option_id": 12,
        "option_name_ar": "صوص أبيض",
        "option_name_en": "White Sauce",
        "aliases": []
      }
    ]
  },
  {
    "variant_id": 5,
    "name_ar": "تحويجة القهوة",
    "name_en": "Coffee Blend",
    "options": [
      {
        "option_id": 13,
        "option_name_ar": "سادة",
        "option_name_en": "Plain",
        "aliases": []
      },
      {
        "option_id": 14,
        "option_name_ar": "محوج",
        "option_name_en": "Spiced",
        "aliases": []
      },
      {
        "option_id": 15,
        "option_name_ar": "فاتح",
        "option_name_en": "Light",
        "aliases": []
      },
      {
        "option_id": 16,
        "option_name_ar": "غامق",
        "option_name_en": "Dark",
        "aliases": []
      },
      {
        "option_id": 17,
        "option_name_ar": "مشكل",
        "option_name_en": "Mixed",
        "aliases": []
      },
      {
        "option_id": 18,
        "option_name_ar": "تركي",
        "option_name_en": "Turkish",
        "aliases": []
      },
      {
        "option_id": 19,
        "option_name_ar": "كويتي",
        "option_name_en": "Kuwaiti",
        "aliases": []
      },
      {
        "option_id": 20,
        "option_name_ar": "العميد",
        "option_name_en": "El-Emad",
        "aliases": []
      },
      {
        "option_id": 21,
        "option_name_ar": "ديل",
        "option_name_en": "Del",
        "aliases": []
      },
      {
        "option_id": 22,
        "option_name_ar": "بندق",
        "option_name_en": "Hazelnut",
        "aliases": []
      }
    ]
  },
  {
    "variant_id": 6,
    "name_ar": "الوزن",
    "name_en": "Weight",
    "options": [
      {
        "option_id": 23,
        "option_name_ar": "جرام",
        "option_name_en": "Gram",
        "aliases": []
      },
      {
        "option_id": 24,
        "option_name_ar": "ثمن كيلو",
        "option_name_en": "Eighth Kilo",
        "aliases": []
      },
      {
        "option_id": 25,
        "option_name_ar": "ربع كيلو",
        "option_name_en": "Quarter Kilo",
        "aliases": []
      },
      {
        "option_id": 26,
        "option_name_ar": "نص كيلو",
        "option_name_en": "Half Kilo",
        "aliases": []
      },
      {
        "option_id": 27,
        "option_name_ar": "750 جرام",
        "option_name_en": "750 Gram",
        "aliases": []
      },
      {
        "option_id": 28,
        "option_name_ar": "كيلو",
        "option_name_en": "Kilo",
        "aliases": []
      }
    ]
  },
  {
    "variant_id": 7,
    "name_ar": "حجم العبوة",
    "name_en": "Package Size",
    "options": [
      {
        "option_id": 29,
        "option_name_ar": "10 ملل",
        "option_name_en": "10 ml",
        "aliases": []
      },
      {
        "option_id": 30,
        "option_name_ar": "20 ملل",
        "option_name_en": "20 ml",
        "aliases": []
      },
      {
        "option_id": 31,
        "option_name_ar": "30 ملل",
        "option_name_en": "30 ml",
        "aliases": []
      },
      {
        "option_id": 32,
        "option_name_ar": "40 ملل",
        "option_name_en": "40 ml",
        "aliases": []
      },
      {
        "option_id": 33,
        "option_name_ar": "50 ملل",
        "option_name_en": "50 ml",
        "aliases": []
      },
      {
        "option_id": 34,
        "option_name_ar": "60 ملل",
        "option_name_en": "60 ml",
        "aliases": []
      },
      {
        "option_id": 35,
        "option_name_ar": "70 ملل",
        "option_name_en": "70 ml",
        "aliases": []
      },
      {
        "option_id": 36,
        "option_name_ar": "80 ملل",
        "option_name_en": "80 ml",
        "aliases": []
      },
      {
        "option_id": 37,
        "option_name_ar": "90 ملل",
        "option_name_en": "90 ml",
        "aliases": []
      },
      {
        "option_id": 38,
        "option_name_ar": "100 ملل",
        "option_name_en": "100 ml",
        "aliases": []
      }
    ]
  },
  {
    "variant_id": 8,
    "name_ar": "العدد",
    "name_en": "Count",
    "options": [
      {
        "option_id": 39,
        "option_name_ar": "قطعتين",
        "option_name_en": "2 Pieces",
        "aliases": []
      },
      {
        "option_id": 40,
        "option_name_ar": "3 قطع",
        "option_name_en": "3 Pieces",
        "aliases": []
      },
      {
        "option_id": 41,
        "option_name_ar": "4 قطع",
        "option_name_en": "4 Pieces",
        "aliases": []
      },
      {
        "option_id": 42,
        "option_name_ar": "5 قطع",
        "option_name_en": "5 Pieces",
        "aliases": []
      },
      {
        "option_id": 43,
        "option_name_ar": "بوكس 6 قطع",
        "option_name_en": "6 Pieces Box",
        "aliases": []
      }
    ]
  },
  {
    "variant_id": 9,
    "name_ar": "نوع العجينة",
    "name_en": "Dough Type",
    "options": [
      {
        "option_id": 52,
        "option_name_ar": "شرقي",
        "option_name_en": "Oriental",
        "aliases": []
      },
      {
        "option_id": 53,
        "option_name_ar": "إيطالي",
        "option_name_en": "Italian",
        "aliases": []
      },
      {
        "option_id": 54,
        "option_name_ar": "عادي",
        "option_name_en": "Regular",
        "aliases": []
      },
      {
        "option_id": 55,
        "option_name_ar": "ملفوف",
        "option_name_en": "Rolled",
        "aliases": []
      }
    ]
  }
];
