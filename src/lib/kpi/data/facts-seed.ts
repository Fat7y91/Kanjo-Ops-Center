import type { KpiLiveOpsDay, KpiScoutEntry, KpiUsageSession } from "@/lib/kpi/types";

/**
 * Fact feed fixtures (Tier 5 seed).
 *
 * `scouts`, `liveOps` and `usage` are owned by the Consumer app / shift system
 * which is not part of this repo yet. These deterministic samples keep the KPI
 * dashboard honest in shape and volume until the real feeds are wired through
 * the repository. Generated-data exception does not apply: this file is small
 * and curated, not machine-generated.
 */

const day = (offset: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const iso = (offsetDays: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
};

const scouts: KpiScoutEntry[] = [
  {
    agentId: "u-rep-mansoura",
    merchantName: "سوق الجمعة للخضروات",
    description:
      "بقالة متوسطة الحجم على شارع الجيش، حجم يومي مرتفع وطلب على التوصيل الصباحي. لا يوجد تعاقد مع منصة منافسة.",
    createdAt: iso(-9),
  },
  {
    agentId: "u-rep-mansoura",
    merchantName: "صيدلية النيل",
    description:
      "صيدلية قريبة من مستشفى المنصورة الدولي، تعمل 24 ساعة وتحتاج تغطية مسائية.",
    createdAt: iso(-7),
  },
  {
    agentId: "u-rep-mansoura",
    merchantName: "مخبز الحرمين",
    description: "مخبز آلي بطاقة إنتاجية كبيرة",
    createdAt: iso(-5),
  },
  {
    agentId: "u-rep-mansoura",
    merchantName: "مطعم البيت الدمياطي",
    description:
      "مطعم أسماك على كورنيش المنصورة، ذروة الطلب مساء الجمعة، يفضل الدفع النقدي.",
    createdAt: iso(-3),
  },
  {
    agentId: "u-rep-mansoura",
    merchantName: "سوبر ماركت المدينة",
    description:
      "سوبر ماركت بثلاثة فروع في وسط المدينة، يديرها نفس المالك ويطلب تغطية موحدة.",
    createdAt: iso(-2),
  },
  {
    agentId: "u-rep-giza",
    merchantName: "بقالة الهرم",
    description: "بقالة صغيرة قرب شارع الهرم.",
    createdAt: iso(-8),
  },
  {
    agentId: "u-rep-giza",
    merchantName: "صيدلية الدقي",
    description:
      "صيدلية في الدقي تخدم مكاتب الشركات، تحتاج ربط منتجات العناية الشخصية.",
    createdAt: iso(-4),
  },
  {
    agentId: "u-rep-giza",
    merchantName: "كافيه فينو",
    description:
      "كافيه متخصص في الحلويات الشرقية والقهوة المختصة، طلبات توصيل عالية في نهاية الأسبوع.",
    createdAt: iso(-1),
  },
];

const liveOps: KpiLiveOpsDay[] = [
  {
    agentId: "u-rep-fox",
    date: day(0),
    shiftOrders: 148,
    gmv: 21_400,
    ticketsResolved: 7,
    merchantsContacted: 24,
    rejectedOrders: 3,
    activeMerchants: 19,
    cashMerchants: 6_800,
    cashDrivers: 4_200,
  },
  {
    agentId: "u-rep-fox",
    date: day(-1),
    shiftOrders: 132,
    gmv: 18_900,
    ticketsResolved: 5,
    merchantsContacted: 21,
    rejectedOrders: 4,
    activeMerchants: 17,
    cashMerchants: 5_900,
    cashDrivers: 3_800,
  },
  {
    agentId: "u-rep-power",
    date: day(0),
    shiftOrders: 171,
    gmv: 26_750,
    ticketsResolved: 9,
    merchantsContacted: 27,
    rejectedOrders: 2,
    activeMerchants: 22,
    cashMerchants: 8_100,
    cashDrivers: 5_300,
  },
  {
    agentId: "u-rep-power",
    date: day(-1),
    shiftOrders: 160,
    gmv: 24_100,
    ticketsResolved: 8,
    merchantsContacted: 25,
    rejectedOrders: 3,
    activeMerchants: 20,
    cashMerchants: 7_400,
    cashDrivers: 4_900,
  },
  {
    agentId: "u-rep-giza",
    date: day(0),
    shiftOrders: 96,
    gmv: 12_800,
    ticketsResolved: 4,
    merchantsContacted: 15,
    rejectedOrders: 5,
    activeMerchants: 12,
    cashMerchants: 3_600,
    cashDrivers: 2_100,
  },
  {
    agentId: "u-rep-giza",
    date: day(-1),
    shiftOrders: 88,
    gmv: 11_300,
    ticketsResolved: 3,
    merchantsContacted: 14,
    rejectedOrders: 6,
    activeMerchants: 11,
    cashMerchants: 3_100,
    cashDrivers: 1_900,
  },
  {
    agentId: "u-rep-mansoura",
    date: day(0),
    shiftOrders: 0,
    gmv: 0,
    ticketsResolved: 0,
    merchantsContacted: 0,
    rejectedOrders: 0,
    activeMerchants: 0,
    cashMerchants: 0,
    cashDrivers: 0,
  },
];

const usage: KpiUsageSession[] = [
  { agentId: "u-rep-fox", date: day(0), minutes: 326 },
  { agentId: "u-rep-fox", date: day(-1), minutes: 288 },
  { agentId: "u-rep-fox", date: day(-2), minutes: 241 },
  { agentId: "u-rep-power", date: day(0), minutes: 372 },
  { agentId: "u-rep-power", date: day(-1), minutes: 341 },
  { agentId: "u-rep-power", date: day(-2), minutes: 305 },
  { agentId: "u-rep-giza", date: day(0), minutes: 214 },
  { agentId: "u-rep-giza", date: day(-1), minutes: 198 },
  { agentId: "u-rep-mansoura", date: day(0), minutes: 264 },
  { agentId: "u-rep-mansoura", date: day(-1), minutes: 231 },
  { agentId: "u-rep-mansoura", date: day(-2), minutes: 206 },
];

export const KPI_SEED = { scouts, liveOps, usage };
