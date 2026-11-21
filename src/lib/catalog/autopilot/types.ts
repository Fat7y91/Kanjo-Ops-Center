export type PosColumnField =
  | "name"
  | "price"
  | "barcode"
  | "unit"
  | "company"
  | "quantity";

export type PosColumnMap = Record<PosColumnField, number | null>;

/** Ordered list used by detectors so matching/fallbacks stay deterministic. */
export const POS_COLUMN_FIELDS: PosColumnField[] = [
  "name",
  "price",
  "barcode",
  "unit",
  "company",
  "quantity",
];

export type ParsedPosItem = {
  row: number;
  name: string;
  /** Immutable sheet price, stored as minor units. */
  priceMinor: number;
  /** Exact digits, never scientific notation. Empty when absent/invalid. */
  barcode: string;
  unit: string;
  /** Manufacturer / agent as printed by the POS, preserved verbatim. */
  company: string;
  /** Remaining stock at export time, or null when the sheet has no quantity. */
  quantity: number | null;
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
  /** Rows merged into an earlier item by code/name during deduplication. */
  mergedDuplicates: number;
};

export type EnrichmentSource =
  | "master_catalog"
  | "reference"
  | "web_search"
  | "existing"
  | "no_image";

export type AutopilotEnrichmentInput = {
  id: string;
  name: string;
  unit: string;
  barcode: string;
  priceMinor: number;
  company?: string;
  quantity?: number | null;
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
  /** Pharmacy reference row this item was matched to, when applicable. */
  referenceProductId?: string | null;
  /** Reference name kept so a reviewer can compare it with the POS name. */
  matchedName?: string | null;
  /** Validated description to copy onto the product, or null to keep it. */
  description?: string | null;
  /** True when the reference text/image failed the quality gate. */
  needsReview?: boolean;
};

export type AutopilotEnrichResponse = {
  items: AutopilotEnrichment[];
  tier2: boolean;
  tier3: boolean;
  imageProxy: boolean;
};

export type AutopilotSaveItem = AutopilotEnrichmentInput & {
  categoryKey: string;
  imageDataUrl: string | null;
  imageUrlRaw?: string | null;
  imageSource: EnrichmentSource;
  masterCatalogId: string | null;
  referenceProductId?: string | null;
  matchedName?: string | null;
  description?: string | null;
  needsReview?: boolean;
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
