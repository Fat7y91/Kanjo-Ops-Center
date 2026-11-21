import { clean, field, matchKey } from "@/lib/import/csv";
import { normalizeSearchText } from "@/lib/search/normalize";

/**
 * Pure mapping for the merchants CSV import.
 *
 * The PO export names its columns in the vendor's vocabulary, so the file is
 * mapped against the central catalogue and the operator's city list before
 * anything is written. Every row that cannot be placed is reported with its
 * line number; the import never guesses a vendor type or a commission rate.
 */

export type MerchantImportRoster = {
  /** Normalised vendor-type name → id and canonical Arabic name. */
  vendorTypes: Map<string, { id: number; name: string }>;
  /** Normalised city name → city id. */
  cities: Map<string, string>;
  /** City used when the file omits one. */
  defaultCityId: string;
};

export type MerchantImportCandidate = {
  line: number;
  name: string;
  normalizedName: string;
  phone: string;
  address: string;
  vendorTypeId: number;
  vendorType: string;
  /** Agreed/target commission percentage, 0–100. */
  commissionRate: number;
  cityId: string;
};

export type MerchantImportIssue = { line: number; message: string };

export type MerchantImportPlan = {
  candidates: MerchantImportCandidate[];
  issues: MerchantImportIssue[];
  duplicates: MerchantImportIssue[];
};

function parsePercent(value: unknown): number | null {
  const text = clean(value)
    .replace(/[٪%]/g, "")
    .replace(/,/g, "")
    .trim();
  if (text === "") return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return Math.round(numeric * 100) / 100;
}

/**
 * Maps raw CSV records to merchant candidates.
 *
 * `line` is the 1-based data line (the header is line 1), matching the other
 * importers so the operator can find the offending spreadsheet row.
 */
export function planMerchantImport(
  rows: readonly Record<string, unknown>[],
  roster: MerchantImportRoster,
): MerchantImportPlan {
  const candidates: MerchantImportCandidate[] = [];
  const issues: MerchantImportIssue[] = [];
  const duplicates: MerchantImportIssue[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const name = clean(field(row, "name", "merchant", "vendor", "اسم التاجر", "التاجر", "الاسم"));
    if (name === "") {
      issues.push({ line, message: "اسم التاجر مفقود." });
      return;
    }

    const normalizedName = normalizeSearchText(name);
    if (seen.has(normalizedName)) {
      duplicates.push({ line, message: `اسم التاجر مكرر داخل الملف: ${name}.` });
      return;
    }

    const vendorLabel = clean(
      field(row, "vendor_type", "vendor_type_name", "type", "نوع التاجر", "التصنيف"),
    );
    const vendor = roster.vendorTypes.get(matchKey(vendorLabel));
    if (!vendor) {
      issues.push({
        line,
        message: vendorLabel
          ? `نوع تاجر غير معروف: ${vendorLabel}.`
          : "نوع التاجر مفقود.",
      });
      return;
    }

    const commissionRate = parsePercent(
      field(row, "commission_rate", "commission", "rate", "نسبة العمولة", "العمولة"),
    );
    if (commissionRate === null) {
      issues.push({ line, message: "نسبة العمولة مفقودة أو غير صالحة." });
      return;
    }

    const cityLabel = clean(field(row, "city", "city_name", "المدينة"));
    const cityId =
      (cityLabel ? roster.cities.get(matchKey(cityLabel)) : undefined) ??
      roster.defaultCityId;
    if (!cityId) {
      issues.push({ line, message: "لا توجد مدينة متاحة لهذا التاجر." });
      return;
    }

    seen.add(normalizedName);
    candidates.push({
      line,
      name,
      normalizedName,
      phone: clean(field(row, "phone", "mobile", "الهاتف", "الجوال", "الموبايل")),
      address: clean(field(row, "address", "location", "العنوان", "الموقع")),
      vendorTypeId: vendor.id,
      vendorType: vendor.name,
      commissionRate,
      cityId,
    });
  });

  return { candidates, issues, duplicates };
}
