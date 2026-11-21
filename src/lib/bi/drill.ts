import {
  BI_CATALOG_META,
  BI_DEAL_STAGE_META,
  BI_DOCUMENT_META,
  BI_MARKETING_META,
  type BiDealStage,
  type BiDocumentKey,
  type BiMarketingChannel,
  type BiTable,
} from "./types";
import type { BiScopedData } from "./select";
import {
  accountsTable,
  complianceTable,
  expensesTable,
  ledgerTable,
  marketingTable,
  payrollTable,
  merchantTable,
} from "./tables";

export type DrillResolution = {
  eyebrow: string;
  title: string;
  description: string;
  table: BiTable;
};

function byStage(scoped: BiScopedData, stage: BiDealStage) {
  return scoped.merchants.filter((merchant) => merchant.stage === stage);
}

/**
 * Merchants behind a catalog-health bucket.
 *
 * Catalog rows are per product, so a merchant with one published and one
 * unpublished product must not appear in both buckets. Published therefore
 * means "has at least one published product"; missing means the opposite.
 */
function merchantsInCatalogState(
  scoped: BiScopedData,
  state: "published" | "missing",
) {
  const published = new Set(
    scoped.catalog
      .filter((row) => row.state === "published")
      .map((row) => row.merchantId),
  );
  return scoped.merchants.filter((merchant) =>
    state === "published"
      ? published.has(merchant.id)
      : !published.has(merchant.id),
  );
}

/**
 * Resolves a drill-down id into the exact record set behind a card.
 *
 * Every clickable element on the dashboard passes a stable id here, so the
 * panel, the table and the CSV export are always derived from the same slice
 * that produced the number the user clicked.
 */
export function resolveDrill(
  id: string,
  scoped: BiScopedData,
): DrillResolution | null {
  if (id.startsWith("funnel-") || id.startsWith("negotiation-")) {
    const prefix = id.startsWith("funnel-") ? "funnel-" : "negotiation-";
    const stage = id.slice(prefix.length) as BiDealStage;
    const meta = BI_DEAL_STAGE_META[stage];
    if (!meta) return null;
    return {
      eyebrow: "مسار التجار",
      title: `تجار مرحلة ${meta.label}`,
      description: "كل التجار المطابقين للمرحلة والفلاتر النشطة.",
      table: merchantTable(
        `drill-${id}`,
        `تجار مرحلة ${meta.label}`,
        "",
        byStage(scoped, stage),
      ),
    };
  }

  if (id.startsWith("compliance-")) {
    const raw = id.slice("compliance-".length);
    if (raw === "all") {
      return {
        eyebrow: "الامتثال",
        title: "الملف القانوني الكامل",
        description: "حالة كل مستند لكل تاجر داخل النطاق.",
        table: complianceTable(scoped.merchants),
      };
    }
    const key = raw as BiDocumentKey;
    const meta = BI_DOCUMENT_META[key];
    if (!meta) return null;
    return {
      eyebrow: "الامتثال",
      title: `${meta.label} — السجلات`,
      description: "التجار مع حالة هذا المستند داخل النطاق.",
      table: complianceTable(
        scoped.merchants.filter((merchant) =>
          Boolean(merchant.documents[key]),
        ),
      ),
    };
  }

  if (id.startsWith("catalog-")) {
    const state = id.slice("catalog-".length) as "published" | "missing";
    const meta = BI_CATALOG_META[state];
    if (!meta) return null;
    return {
      eyebrow: "الكتالوج",
      title: `تجار بحالة ${meta.label}`,
      description:
        state === "published"
          ? "التجار الذين لديهم منتجات منشورة في الكتالوج."
          : "التجار الذين لم يُنشروا أي منتج بعد.",
      table: merchantTable(
        `drill-${id}`,
        `تجار بحالة ${meta.label}`,
        "",
        merchantsInCatalogState(scoped, state),
      ),
    };
  }

  if (id.startsWith("marketing-channel-")) {
    const channel = id.slice("marketing-channel-".length) as BiMarketingChannel;
    const label = BI_MARKETING_META[channel];
    if (!label) return null;
    return {
      eyebrow: "التسويق",
      title: `قناة ${label}`,
      description: "الحملات والوصول والتحويلات لهذه القناة.",
      table: marketingTable(
        scoped.marketing.filter((row) => row.channel === channel),
      ),
    };
  }

  switch (id) {
    case "finance-collected":
      return {
        eyebrow: "المالية",
        title: "العمولات المحصّلة",
        description: "التجار الموقّعون الذين تُحتسب عمولتهم.",
        table: merchantTable(
          "finance-collected",
          "العمولات المحصّلة",
          "",
          scoped.merchants.filter((merchant) => merchant.collected > 0),
        ),
      };
    case "finance-expenses":
      return {
        eyebrow: "المالية",
        title: "المصروفات",
        description: "كل بنود المصروفات داخل الفترة والنطاق.",
        table: expensesTable(scoped.expenses),
      };
    case "accounts-balance":
      return {
        eyebrow: "الخزينة",
        title: "أرصدة الحسابات البنكية",
        description: "الرصيد الحالي لكل حساب محسوب من دفتر الحركات.",
        table: accountsTable(scoped.accounts),
      };
    case "accounts-expenses":
      return {
        eyebrow: "الخزينة",
        title: "المصروفات المدفوعة",
        description: "كل حركة مصروف مسجّلة في دفتر الحسابات.",
        table: ledgerTable(scoped.ledger),
      };
    case "finance-pending":
      return {
        eyebrow: "المالية",
        title: "الرواتب المستحقة",
        description: "صافي مسير الشهر لكل مشغّل قبل الصرف.",
        table: payrollTable(scoped.payslips),
      };
    case "finance-net":
      return {
        eyebrow: "المالية",
        title: "تفصيل صافي الربح",
        description: "المصروفات المؤثرة على صافي الربح في الفترة.",
        table: expensesTable(scoped.expenses),
      };
    case "marketing-reach":
    case "marketing-leads":
    case "marketing-spend":
    case "marketing-conversions":
      return {
        eyebrow: "التسويق",
        title: "أداء الحملات",
        description: "كل صفوف التسويق داخل الفترة والنطاق.",
        table: marketingTable(scoped.marketing),
      };
    case "catalog-all":
      return {
        eyebrow: "الكتالوج",
        title: "خط إدخال البيانات",
        description: "التجار المطابقون للنطاق مع حالة جاهزية كتالوجهم.",
        table: merchantTable(
          "catalog-all",
          "تجار الكتالوج",
          "",
          scoped.merchants,
        ),
      };
    case "merchants-all":
      return {
        eyebrow: "التجار",
        title: "كل التجار في النطاق",
        description: "السجلات الكاملة المطابقة للفلاتر النشطة.",
        table: merchantTable(
          "merchants-all",
          "كل التجار",
          "",
          scoped.merchants,
        ),
      };
    default:
      return null;
  }
}
