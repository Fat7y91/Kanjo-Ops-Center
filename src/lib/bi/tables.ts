import {
  BI_CATALOG_META,
  BI_DEAL_STAGE_META,
  BI_DOCUMENT_META,
  BI_EXPENSE_META,
  BI_MARKETING_META,
  type BiColumn,
  type BiRow,
  type BiTable,
} from "./types";
import type { BiScopedData } from "./select";

const MERCHANT_COLUMNS: BiColumn[] = [
  { key: "name", label: "التاجر" },
  { key: "cityName", label: "المدينة" },
  { key: "team", label: "الفريق" },
  { key: "vendorType", label: "النوع" },
  { key: "stage", label: "المرحلة", type: "status" },
  { key: "monthlyValue", label: "القيمة الشهرية", type: "currency", align: "end" },
  { key: "targetCommission", label: "الهدف %", type: "percent", align: "end" },
  { key: "achievedCommission", label: "المحقّق %", type: "percent", align: "end" },
  { key: "lastVisitAt", label: "آخر زيارة", type: "date", align: "end" },
];

function merchantRow(merchant: BiScopedData["merchants"][number]): BiRow {
  return {
    name: merchant.name,
    cityName: merchant.cityName,
    team: merchant.team,
    vendorType: merchant.vendorType,
    stage: BI_DEAL_STAGE_META[merchant.stage].label,
    monthlyValue: merchant.monthlyValue,
    targetCommission: merchant.targetCommission,
    achievedCommission: merchant.achievedCommission,
    lastVisitAt: merchant.lastVisitAt,
  };
}

export function merchantTable(
  id: string,
  title: string,
  description: string,
  merchants: BiScopedData["merchants"],
): BiTable {
  return {
    id,
    title,
    description,
    columns: MERCHANT_COLUMNS,
    rows: merchants.map(merchantRow),
  };
}

export function expensesTable(expenses: BiScopedData["expenses"]): BiTable {
  return {
    id: "expenses",
    title: "المصروفات المسجّلة",
    description: "كل بند مصروف داخل النطاق والفترة المحددين.",
    columns: [
      { key: "label", label: "البند" },
      { key: "category", label: "التصنيف", type: "status" },
      { key: "cityName", label: "المدينة" },
      { key: "amount", label: "المبلغ", type: "currency", align: "end" },
      { key: "incurredAt", label: "التاريخ", type: "date", align: "end" },
    ],
    rows: expenses.map((row) => ({
      label: row.label,
      category: BI_EXPENSE_META[row.category],
      cityName: row.cityName,
      amount: row.amount,
      incurredAt: row.incurredAt,
    })),
  };
}

export function marketingTable(
  marketing: BiScopedData["marketing"],
): BiTable {
  return {
    id: "marketing",
    title: "أداء الحملات",
    description: "الوصول والتحويلات لكل قناة تسويقية داخل النطاق.",
    columns: [
      { key: "campaign", label: "الحملة" },
      { key: "channel", label: "القناة", type: "status" },
      { key: "cityName", label: "المدينة" },
      { key: "reach", label: "الوصول", type: "number", align: "end" },
      { key: "leads", label: "العملاء المحتملون", type: "number", align: "end" },
      { key: "conversions", label: "التحويلات", type: "number", align: "end" },
      { key: "spend", label: "الإنفاق", type: "currency", align: "end" },
      { key: "occurredAt", label: "التاريخ", type: "date", align: "end" },
    ],
    rows: marketing.map((row) => ({
      campaign: row.campaign,
      channel: BI_MARKETING_META[row.channel],
      cityName: row.cityName,
      reach: row.reach,
      leads: row.leads,
      conversions: row.conversions,
      spend: row.spend,
      occurredAt: row.occurredAt,
    })),
  };
}

export function catalogTable(catalog: BiScopedData["catalog"]): BiTable {
  return {
    id: "catalog",
    title: "خط إدخال البيانات",
    description: "حالة منتجات الكتالوج لكل تاجر داخل النطاق.",
    columns: [
      { key: "merchantName", label: "التاجر" },
      { key: "name", label: "المنتج" },
      { key: "cityName", label: "المدينة" },
      { key: "state", label: "الحالة", type: "status" },
      { key: "price", label: "السعر", type: "currency", align: "end" },
      { key: "updatedAt", label: "آخر تحديث", type: "date", align: "end" },
    ],
    rows: catalog.map((row) => ({
      merchantName: row.merchantName,
      name: row.name,
      cityName: row.cityName,
      state: BI_CATALOG_META[row.state].label,
      price: row.price,
      updatedAt: row.updatedAt,
    })),
  };
}

export function complianceTable(
  merchants: BiScopedData["merchants"],
): BiTable {
  return {
    id: "compliance",
    title: "اكتمال الملف القانوني",
    description: "الحالة لكل مستند مطلوب في حزمة الامتثال.",
    columns: [
      { key: "name", label: "التاجر" },
      { key: "cityName", label: "المدينة" },
      { key: "team", label: "الفريق" },
      ...([...Object.keys(BI_DOCUMENT_META)] as Array<
        keyof typeof BI_DOCUMENT_META
      >).map<BiColumn>((key) => ({
        key,
        label: BI_DOCUMENT_META[key].label,
        type: "status",
      })),
      { key: "complete", label: "المكتمل", type: "number", align: "end" },
    ],
    rows: merchants.map((merchant) => {
      const entries = Object.entries(merchant.documents) as Array<
        [keyof typeof merchant.documents, boolean]
      >;
      const row: BiRow = {
        name: merchant.name,
        cityName: merchant.cityName,
        team: merchant.team,
        complete: entries.filter(([, done]) => done).length,
      };
      for (const [key, done] of entries) {
        row[key] = done ? "مكتمل" : "ناقص";
      }
      return row;
    }),
  };
}
