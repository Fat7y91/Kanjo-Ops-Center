import type { EgyptCity, EgyptGovernorate } from "@/lib/geo/types";

type CitySeed = [nameEn: string, name: string, lat: number, lng: number, population: number];

function cities(governorateId: string, seeds: CitySeed[]): EgyptCity[] {
  return seeds.map(([nameEn, name, lat, lng, population]) => ({
    id: `${governorateId}-${nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    name,
    nameEn,
    lat,
    lng,
    population,
  }));
}

export const EGYPT_GOVERNORATES: EgyptGovernorate[] = [
  {
    id: "cairo",
    name: "القاهرة",
    nameEn: "Cairo",
    center: { lat: 30.0444, lng: 31.2357 },
    population: 10_100_000,
    areaKm2: 3_085,
    cities: cities("cairo", [
      ["Cairo", "القاهرة", 30.0444, 31.2357, 9_700_000],
      ["New Cairo", "القاهرة الجديدة", 30.03, 31.47, 1_500_000],
      ["Helwan", "حلوان", 29.8414, 31.3008, 650_000],
      ["Shubra", "شبرا", 30.1286, 31.2444, 1_000_000],
    ]),
  },
  {
    id: "giza",
    name: "الجيزة",
    nameEn: "Giza",
    center: { lat: 30.0131, lng: 31.2089 },
    population: 9_450_000,
    areaKm2: 13_184,
    cities: cities("giza", [
      ["Giza", "الجيزة", 30.0131, 31.2089, 4_900_000],
      ["6th of October", "السادس من أكتوبر", 29.9285, 30.9188, 1_200_000],
      ["Sheikh Zayed", "الشيخ زايد", 30.013, 30.955, 900_000],
      ["Hawamdeya", "الحوامدية", 29.9, 31.25, 250_000],
      ["El Badrashein", "البدرشين", 29.85, 31.27, 200_000],
    ]),
  },
  {
    id: "alexandria",
    name: "الإسكندرية",
    nameEn: "Alexandria",
    center: { lat: 31.2001, lng: 29.9187 },
    population: 5_450_000,
    areaKm2: 2_300,
    cities: cities("alexandria", [
      ["Alexandria", "الإسكندرية", 31.2001, 29.9187, 5_100_000],
      ["Borg El Arab", "برج العرب", 30.9167, 29.55, 180_000],
      ["Abu Qir", "أبو قير", 31.3167, 30.0667, 150_000],
      ["El Amreya", "العامرية", 31.0333, 29.9833, 220_000],
    ]),
  },
  {
    id: "dakahlia",
    name: "الدقهلية",
    nameEn: "Dakahlia",
    center: { lat: 31.0409, lng: 31.3785 },
    population: 6_900_000,
    areaKm2: 3_471,
    cities: cities("dakahlia", [
      ["Mansoura", "المنصورة", 31.0409, 31.3785, 1_650_000],
      ["Mit Ghamr", "ميت غمر", 30.7167, 31.25, 480_000],
      ["Talkha", "طلخا", 31.05, 31.3667, 420_000],
      ["Belqas", "بلقاس", 31.2167, 31.35, 350_000],
      ["Aga", "أجا", 30.9333, 31.2833, 300_000],
    ]),
  },
  {
    id: "sharqia",
    name: "الشرقية",
    nameEn: "Sharqia",
    center: { lat: 30.5877, lng: 31.502 },
    population: 7_900_000,
    areaKm2: 4_911,
    cities: cities("sharqia", [
      ["Zagazig", "الزقازيق", 30.5877, 31.502, 1_400_000],
      ["10th of Ramadan", "العاشر من رمضان", 30.3, 31.75, 750_000],
      ["Bilbeis", "بلبيس", 30.4167, 31.5667, 450_000],
      ["Minya El Qamh", "منيا القمح", 30.5, 31.35, 400_000],
      ["Hehia", "ههيا", 30.6667, 31.5833, 250_000],
    ]),
  },
  {
    id: "qalyubia",
    name: "القليوبية",
    nameEn: "Qalyubia",
    center: { lat: 30.4667, lng: 31.1833 },
    population: 5_900_000,
    areaKm2: 1_001,
    cities: cities("qalyubia", [
      ["Banha", "بنها", 30.4667, 31.1833, 1_100_000],
      ["Shubra El Kheima", "شبرا الخيمة", 30.1286, 31.2422, 1_250_000],
      ["Qalyub", "قليوب", 30.1833, 31.2167, 500_000],
      ["Khanka", "الخانكة", 30.2167, 31.1667, 350_000],
    ]),
  },
  {
    id: "kafr-el-sheikh",
    name: "كفر الشيخ",
    nameEn: "Kafr El Sheikh",
    center: { lat: 31.1107, lng: 30.9388 },
    population: 3_600_000,
    areaKm2: 3_437,
    cities: cities("kafr-el-sheikh", [
      ["Kafr El Sheikh", "كفر الشيخ", 31.1107, 30.9388, 800_000],
      ["Desouk", "دسوق", 31.1333, 30.65, 450_000],
      ["Fuwwah", "فوة", 31.2, 30.55, 220_000],
      ["Baltim", "بلطيم", 31.55, 31.1, 200_000],
    ]),
  },
  {
    id: "gharbia",
    name: "الغربية",
    nameEn: "Gharbia",
    center: { lat: 30.7865, lng: 31.0004 },
    population: 5_400_000,
    areaKm2: 1_942,
    cities: cities("gharbia", [
      ["Tanta", "طنطا", 30.7865, 31.0004, 1_500_000],
      ["Mahalla El Kubra", "المحلة الكبرى", 30.9706, 31.1667, 1_200_000],
      ["Kafr El Zayat", "كفر الزيات", 30.8167, 30.8167, 450_000],
      ["Zefta", "زفتى", 30.7167, 31.25, 400_000],
    ]),
  },
  {
    id: "monufia",
    name: "المنوفية",
    nameEn: "Monufia",
    center: { lat: 30.55, lng: 31.0 },
    population: 4_600_000,
    areaKm2: 1_532,
    cities: cities("monufia", [
      ["Shibin El Kom", "شبين الكوم", 30.55, 31.0, 900_000],
      ["Menouf", "منوف", 30.4667, 30.9333, 450_000],
      ["Ashmoun", "أشمون", 30.3, 30.9667, 350_000],
      ["Quesna", "قويسنا", 30.5667, 31.15, 320_000],
    ]),
  },
  {
    id: "beheira",
    name: "البحيرة",
    nameEn: "Beheira",
    center: { lat: 31.0341, lng: 30.4682 },
    population: 6_700_000,
    areaKm2: 10_130,
    cities: cities("beheira", [
      ["Damanhur", "دمنهور", 31.0341, 30.4682, 1_200_000],
      ["Kafr El Dawwar", "كفر الدوار", 31.1333, 30.1333, 700_000],
      ["Rashid", "رشيد", 31.4, 30.4167, 280_000],
      ["Itay El Barud", "إيتاي البارود", 30.8833, 30.6667, 300_000],
    ]),
  },
  {
    id: "ismailia",
    name: "الإسماعيلية",
    nameEn: "Ismailia",
    center: { lat: 30.5965, lng: 32.2715 },
    population: 1_500_000,
    areaKm2: 1_442,
    cities: cities("ismailia", [
      ["Ismailia", "الإسماعيلية", 30.5965, 32.2715, 900_000],
      ["Fayed", "فايد", 30.3167, 32.3, 150_000],
      ["Qantara West", "القنطرة غرب", 30.85, 32.3167, 180_000],
    ]),
  },
  {
    id: "port-said",
    name: "بورسعيد",
    nameEn: "Port Said",
    center: { lat: 31.2653, lng: 32.3019 },
    population: 800_000,
    areaKm2: 1_345,
    cities: cities("port-said", [
      ["Port Said", "بورسعيد", 31.2653, 32.3019, 650_000],
      ["Port Fouad", "بورفؤاد", 31.25, 32.3167, 120_000],
    ]),
  },
  {
    id: "suez",
    name: "السويس",
    nameEn: "Suez",
    center: { lat: 29.9668, lng: 32.5498 },
    population: 800_000,
    areaKm2: 17_840,
    cities: cities("suez", [
      ["Suez", "السويس", 29.9668, 32.5498, 550_000],
      ["Ain Sokhna", "العين السخنة", 29.6, 32.3167, 60_000],
    ]),
  },
  {
    id: "north-sinai",
    name: "شمال سيناء",
    nameEn: "North Sinai",
    center: { lat: 31.1316, lng: 33.7984 },
    population: 500_000,
    areaKm2: 27_574,
    cities: cities("north-sinai", [
      ["Arish", "العريش", 31.1316, 33.7984, 250_000],
      ["Bir al-Abd", "بئر العبد", 31.0, 33.0, 80_000],
      ["Sheikh Zuweid", "الشيخ زويد", 31.2167, 34.1, 70_000],
    ]),
  },
  {
    id: "south-sinai",
    name: "جنوب سيناء",
    nameEn: "South Sinai",
    center: { lat: 27.9158, lng: 34.3299 },
    population: 110_000,
    areaKm2: 33_140,
    cities: cities("south-sinai", [
      ["Sharm El Sheikh", "شرم الشيخ", 27.9158, 34.3299, 50_000],
      ["El Tor", "الطور", 28.2417, 33.6222, 30_000],
      ["Dahab", "دهب", 28.5091, 34.5136, 20_000],
      ["Nuweiba", "نويبع", 28.9667, 34.6667, 8_000],
    ]),
  },
  {
    id: "red-sea",
    name: "البحر الأحمر",
    nameEn: "Red Sea",
    center: { lat: 27.2579, lng: 33.8116 },
    population: 400_000,
    areaKm2: 203_685,
    cities: cities("red-sea", [
      ["Hurghada", "الغردقة", 27.2579, 33.8116, 200_000],
      ["Safaga", "سفاجا", 26.75, 33.9333, 50_000],
      ["Marsa Alam", "مرسى علم", 25.0667, 34.9, 20_000],
      ["Qoseir", "القصير", 26.1, 34.2833, 40_000],
    ]),
  },
  {
    id: "new-valley",
    name: "الوادي الجديد",
    nameEn: "New Valley",
    center: { lat: 25.439, lng: 30.558 },
    population: 260_000,
    areaKm2: 440_098,
    cities: cities("new-valley", [
      ["Kharga", "الخارجة", 25.439, 30.558, 100_000],
      ["Dakhla", "الداخلة", 25.5, 29.0, 80_000],
      ["Farafra", "الفرافرة", 27.05, 27.9667, 40_000],
    ]),
  },
  {
    id: "matrouh",
    name: "مطروح",
    nameEn: "Matrouh",
    center: { lat: 31.3543, lng: 27.2373 },
    population: 500_000,
    areaKm2: 166_563,
    cities: cities("matrouh", [
      ["Marsa Matrouh", "مرسى مطروح", 31.3543, 27.2373, 180_000],
      ["Siwa", "سيوة", 29.2032, 25.5195, 30_000],
      ["El Alamein", "العلمين", 30.8333, 28.95, 50_000],
      ["Sallum", "السلوم", 31.55, 25.15, 20_000],
    ]),
  },
  {
    id: "luxor",
    name: "الأقصر",
    nameEn: "Luxor",
    center: { lat: 25.6872, lng: 32.6396 },
    population: 1_400_000,
    areaKm2: 2_410,
    cities: cities("luxor", [
      ["Luxor", "الأقصر", 25.6872, 32.6396, 900_000],
      ["Esna", "إسنا", 25.3, 32.55, 200_000],
      ["Armant", "أرمنت", 25.6167, 32.5333, 150_000],
      ["Toud", "طود", 25.5833, 32.5833, 80_000],
    ]),
  },
  {
    id: "aswan",
    name: "أسوان",
    nameEn: "Aswan",
    center: { lat: 24.0889, lng: 32.8998 },
    population: 1_700_000,
    areaKm2: 62_726,
    cities: cities("aswan", [
      ["Aswan", "أسوان", 24.0889, 32.8998, 800_000],
      ["Kom Ombo", "كوم أمبو", 24.4667, 32.95, 250_000],
      ["Edfu", "إدفو", 24.9667, 32.8667, 300_000],
      ["Abu Simbel", "أبو سمبل", 22.3372, 31.6258, 20_000],
    ]),
  },
  {
    id: "qena",
    name: "قنا",
    nameEn: "Qena",
    center: { lat: 26.1551, lng: 32.716 },
    population: 3_400_000,
    areaKm2: 1_851,
    cities: cities("qena", [
      ["Qena", "قنا", 26.1551, 32.716, 900_000],
      ["Nag Hammadi", "نجع حمادي", 26.05, 32.25, 400_000],
      ["Qift", "قفط", 26.0, 32.8167, 200_000],
    ]),
  },
  {
    id: "sohag",
    name: "سوهاج",
    nameEn: "Sohag",
    center: { lat: 26.5591, lng: 31.6957 },
    population: 5_600_000,
    areaKm2: 1_547,
    cities: cities("sohag", [
      ["Sohag", "سوهاج", 26.5591, 31.6957, 1_300_000],
      ["Girga", "جرجا", 26.3333, 31.8833, 500_000],
      ["Akhmim", "أخميم", 26.5667, 31.75, 450_000],
      ["Tahta", "طهطا", 26.7667, 31.5, 400_000],
    ]),
  },
  {
    id: "asyut",
    name: "أسيوط",
    nameEn: "Asyut",
    center: { lat: 27.1809, lng: 31.1837 },
    population: 4_800_000,
    areaKm2: 1_553,
    cities: cities("asyut", [
      ["Asyut", "أسيوط", 27.1809, 31.1837, 1_300_000],
      ["Abnoub", "أبنوب", 27.2667, 31.15, 350_000],
      ["Manfalut", "منفلوط", 27.3167, 30.9667, 450_000],
      ["Dairut", "ديروط", 27.55, 30.8, 400_000],
    ]),
  },
  {
    id: "minya",
    name: "المنيا",
    nameEn: "Minya",
    center: { lat: 28.1099, lng: 30.7503 },
    population: 6_100_000,
    areaKm2: 2_262,
    cities: cities("minya", [
      ["Minya", "المنيا", 28.1099, 30.7503, 1_400_000],
      ["Mallawi", "ملوي", 27.7333, 30.8333, 600_000],
      ["Beni Mazar", "بني مزار", 28.5, 30.8, 500_000],
      ["Samalut", "سمالوط", 28.3, 30.7, 400_000],
    ]),
  },
  {
    id: "beni-suef",
    name: "بني سويف",
    nameEn: "Beni Suef",
    center: { lat: 29.0661, lng: 31.0994 },
    population: 3_700_000,
    areaKm2: 1_322,
    cities: cities("beni-suef", [
      ["Beni Suef", "بني سويف", 29.0661, 31.0994, 1_000_000],
      ["Nasser", "ناصر", 29.1333, 31.1, 400_000],
      ["Ihnasia", "إهناسيا", 29.0833, 31.05, 350_000],
      ["Biba", "ببا", 28.9167, 30.9833, 300_000],
    ]),
  },
  {
    id: "fayoum",
    name: "الفيوم",
    nameEn: "Fayoum",
    center: { lat: 29.3084, lng: 30.8428 },
    population: 4_000_000,
    areaKm2: 6_068,
    cities: cities("fayoum", [
      ["Fayoum", "الفيوم", 29.3084, 30.8428, 1_100_000],
      ["Senoris", "سنورس", 29.4, 30.8667, 450_000],
      ["Ibshway", "إبشواي", 29.35, 30.6833, 350_000],
      ["Tamiya", "طامية", 29.4667, 30.95, 300_000],
    ]),
  },
  {
    id: "damietta",
    name: "دمياط",
    nameEn: "Damietta",
    center: { lat: 31.4165, lng: 31.8133 },
    population: 1_900_000,
    areaKm2: 910,
    cities: cities("damietta", [
      ["Damietta", "دمياط", 31.4165, 31.8133, 900_000],
      ["New Damietta", "دمياط الجديدة", 31.4, 31.7, 300_000],
      ["Faraskur", "فارسكور", 31.3, 31.75, 250_000],
      ["Kafr Saad", "كفر سعد", 31.35, 31.7, 200_000],
    ]),
  },
];

export const EGYPT_CITIES: EgyptCity[] = EGYPT_GOVERNORATES.flatMap(
  (governorate) => governorate.cities,
);

export function findGovernorate(id: string): EgyptGovernorate | undefined {
  return EGYPT_GOVERNORATES.find((governorate) => governorate.id === id);
}

export function findGovernorateByName(
  name: string,
): EgyptGovernorate | undefined {
  const normalized = name.trim();
  return EGYPT_GOVERNORATES.find(
    (governorate) =>
      governorate.name === normalized ||
      governorate.nameEn.toLowerCase() === normalized.toLowerCase(),
  );
}

export function findEgyptCity(id: string): EgyptCity | undefined {
  return EGYPT_CITIES.find((city) => city.id === id);
}

export function findGovernorateForCity(cityId: string): EgyptGovernorate | undefined {
  return EGYPT_GOVERNORATES.find((governorate) =>
    governorate.cities.some((city) => city.id === cityId),
  );
}

export function findCityByName(name: string): EgyptCity | undefined {
  const normalized = name.trim();
  return EGYPT_CITIES.find(
    (city) => city.name === normalized || city.nameEn.toLowerCase() === normalized.toLowerCase(),
  );
}
