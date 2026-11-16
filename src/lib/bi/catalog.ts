import type { BiCatalogRow } from "./types";

export type CatalogSummary = {
  published: number;
  missing: number;
  total: number;
  readiness: number;
  /**
   * Merchant-level publish state, mirroring the catalog screen's
   * "منشور على التطبيق" slice: a merchant is live when its V1 dashboard flag is
   * set and it actually carries products. The product counters above stay
   * separate because the catalog drill-down lists product rows.
   */
  liveMerchants: number;
  merchantTotal: number;
  merchantReadiness: number;
};

export function buildCatalog(
  rows: readonly BiCatalogRow[],
): CatalogSummary {
  const published = rows.filter((row) => row.state === "published").length;
  const missing = rows.filter((row) => row.state === "missing").length;
  const total = published + missing;

  const merchants = new Map<
    string,
    { appPublished: boolean; hasProducts: boolean }
  >();
  for (const row of rows) {
    const entry = merchants.get(row.merchantId) ?? {
      appPublished: false,
      hasProducts: false,
    };
    entry.appPublished ||= row.appPublished;
    if (row.id !== `catalog-missing-${row.merchantId}`) entry.hasProducts = true;
    merchants.set(row.merchantId, entry);
  }

  const liveMerchants = Array.from(merchants.values()).filter(
    (merchant) => merchant.appPublished && merchant.hasProducts,
  ).length;
  const merchantTotal = merchants.size;

  return {
    published,
    missing,
    total,
    readiness: total === 0 ? 0 : published / total,
    liveMerchants,
    merchantTotal,
    merchantReadiness:
      merchantTotal === 0 ? 0 : liveMerchants / merchantTotal,
  };
}
