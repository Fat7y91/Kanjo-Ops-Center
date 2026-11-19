export type PosColumnField = "name" | "price" | "barcode" | "unit";

export type PosColumnMap = Record<PosColumnField, number | null>;

export type ParsedPosItem = {
  row: number;
  name: string;
  /** Immutable sheet price, stored as minor units. */
  priceMinor: number;
  /** Exact digits, never scientific notation. Empty when absent/invalid. */
  barcode: string;
  unit: string;
};

export type SkippedPosRow = {
  row: number;
  name: string;
  reason: string;
};

export type ParsedPosSheet = {
  items: ParsedPosItem[];
  skipped: SkippedPosRow[];
  columns: PosColumnMap;
  headerRow: number | null;
  sheetName: string;
};

export type EnrichmentSource = "master_catalog" | "web_search" | "no_image";

export type AutopilotEnrichmentInput = {
  id: string;
  name: string;
  unit: string;
  barcode: string;
  priceMinor: number;
};

export type AutopilotEnrichment = {
  id: string;
  imageDataUrl: string | null;
  imageSource: EnrichmentSource;
  /** Raw external URL kept for audit; never rendered directly. */
  imageUrlRaw: string | null;
  categoryKey: string;
  masterCatalogId: string | null;
  searchQuery: string | null;
};

export type AutopilotSaveItem = AutopilotEnrichmentInput & {
  categoryKey: string;
  imageDataUrl: string | null;
  imageUrlRaw?: string | null;
  imageSource: EnrichmentSource;
  masterCatalogId: string | null;
};

export type AutopilotSaveResult = {
  inserted: number;
  updated: number;
  failed: number;
  failures: { name: string; message: string }[];
};

export type AutopilotSummary = {
  totalParsed: number;
  inserted: number;
  updated: number;
  matchedMaster: number;
  enrichedWeb: number;
  noImage: number;
  skippedParse: number;
  saveFailed: number;
  failures: { name: string; message: string }[];
};
