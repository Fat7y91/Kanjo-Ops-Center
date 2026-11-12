import "server-only";

import { listCities } from "@/lib/field-ops/store";
import { matchKey } from "@/lib/import/csv";
import { listVendorTypes } from "@/lib/taxonomy/store";

import { planMerchantImport, type MerchantImportRoster } from "./import";
import {
  insertMerchantImports,
  isMerchantImportConfigured,
} from "./import-repository";

/**
 * Tier 3 rules for the merchants CSV import.
 *
 * Builds the matching roster from the live catalogue and city list, maps every
 * row with the same pure function the preview used, then writes the accepted
 * rows. A missing database is a typed 503 rather than an empty success.
 */

export class MerchantImportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MerchantImportError";
    this.code = code;
    this.status = status;
  }
}

async function buildRoster(
  defaultCityId: string,
  allowedCityIds: readonly string[],
): Promise<MerchantImportRoster> {
  const allowed = new Set(allowedCityIds);
  const [vendorTypes, allCities] = await Promise.all([
    listVendorTypes(),
    listCities(),
  ]);
  const cities = allCities.filter((city) => allowed.has(city.id));

  const vendorMap = new Map<string, { id: number; name: string }>();
  for (const vendor of vendorTypes) {
    if (!vendor.active) continue;
    vendorMap.set(matchKey(vendor.name_ar), { id: vendor.id, name: vendor.name_ar });
    if (vendor.name_en) {
      vendorMap.set(matchKey(vendor.name_en), { id: vendor.id, name: vendor.name_ar });
    }
  }

  const cityMap = new Map<string, string>();
  for (const city of cities) {
    cityMap.set(matchKey(city.name), city.id);
  }

  const fallback =
    (defaultCityId ? cities.find((city) => city.id === defaultCityId)?.id : undefined) ??
    cities[0]?.id ??
    "";

  return { vendorTypes: vendorMap, cities: cityMap, defaultCityId: fallback };
}

export async function importMerchants(
  rows: readonly Record<string, unknown>[],
  createdBy: string,
  defaultCityId: string,
  allowedCityIds: readonly string[],
): Promise<{ imported: number; skipped: { line: number; message: string }[] }> {
  if (!isMerchantImportConfigured()) {
    throw new MerchantImportError(
      "MERCHANTS_UNAVAILABLE",
      "قاعدة بيانات التجار غير متصلة.",
      503,
    );
  }

  const roster = await buildRoster(defaultCityId, allowedCityIds);
  const plan = planMerchantImport(rows, roster);
  const skipped = [...plan.duplicates, ...plan.issues];

  if (plan.candidates.length === 0) {
    return { imported: 0, skipped };
  }

  const result = await insertMerchantImports(plan.candidates, createdBy);
  return { imported: result.imported, skipped: [...skipped, ...result.skipped] };
}
