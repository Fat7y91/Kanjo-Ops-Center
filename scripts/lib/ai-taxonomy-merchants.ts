import { VENDOR_TYPE_SEED } from "../../src/lib/taxonomy/data.generated";

import {
  CONFIDENCE_THRESHOLD,
  extractJsonArray,
  normalizeLabel,
} from "./ai-taxonomy-core";

export type MerchantRow = {
  id: string;
  name: string;
  vendor_type: string;
  strategic_notes?: string | null;
};

export type MerchantClassification = {
  id: string;
  vendor_type_id: number | null;
  confidence: number;
  needs_human_review: boolean;
};

const VALID_TYPE_IDS = new Set(VENDOR_TYPE_SEED.map((vendor) => vendor.id));

const CATEGORY_ALIASES: Record<string, number> = {
  "مطاعم وكافيهات": 1,
  مطعم: 1,
  "مطاعم": 1,
  "قهوة وعصاير": 2,
  "عصائر فريش": 2,
  عصائر: 2,
  صيدلية: 3,
  "صيدليات وعناية": 3,
  "سوبر ماركت": 4,
  حلويات: 5,
  الحلو: 5,
  مخبز: 6,
  "جزارة ودواجن وأسماك": 7,
  جزارة: 7,
  "خضار وفاكهة": 8,
  "محمصة وعطارة": 9,
  "عطارة وتوابل": 9,
  مسليات: 9,
  "مكتبات وهدايا": 10,
  مكتبات: 10,
  هدايا: 10,
  "ادوية بيطرية": 11,
  "أدوات كهربائية": 12,
  "مستحضرات التجميل": 13,
  منظفات: 14,
  "موبايلات واكسسوارات": 15,
};

export function localMerchantType(row: MerchantRow): number | null {
  const label = normalizeLabel(row.vendor_type);
  if (!label) return null;
  if (CATEGORY_ALIASES[label]) return CATEGORY_ALIASES[label];
  const exact = VENDOR_TYPE_SEED.find(
    (vendor) =>
      normalizeLabel(vendor.name_ar) === label ||
      normalizeLabel(vendor.name_en) === label,
  );
  return exact?.id ?? null;
}

export function needsMerchantType(row: MerchantRow): boolean {
  return localMerchantType(row) === null;
}

export const SYSTEM_PROMPT = `You classify merchants for an Egyptian quick-commerce operator into the ONLY valid vendor types.
You receive merchant id, store name, the legacy category text when present, and optional notes.
Choose exactly one vendor_type_id from the supplied list.

Rules:
- Use ONLY vendor_type_id values from the list. Never invent an id.
- Prefer the merchant name and the legacy category over notes.
- When two types are plausible, choose the narrower one only if the evidence is explicit; otherwise return null.
- confidence is an integer 0-100.
- Return a STRICT JSON array, no prose and no markdown fences:
  [{"id":"<merchant id>","vendor_type_id":<id or null>,"confidence":<0-100>}]
- Return exactly one object per input merchant, preserving each id.`;

export function buildUserPrompt(merchants: MerchantRow[]): string {
  const types = VENDOR_TYPE_SEED.map(
    (vendor) => `${vendor.id} | ar=${vendor.name_ar} | en=${vendor.name_en}`,
  );
  const rows = merchants.map((merchant) => {
    const notes = (merchant.strategic_notes ?? "").replace(/\s+/g, " ").slice(0, 120);
    return `${merchant.id} | name=${merchant.name} | category=${merchant.vendor_type || "unknown"} | notes=${notes}`;
  });
  return [
    "VENDOR TYPES (id | Arabic | English):",
    ...types,
    "",
    "MERCHANTS (id | name | legacy category | notes):",
    ...rows,
    "",
    "Return the strict JSON array now.",
  ].join("\n");
}

export function coerceMerchantClassifications(
  raw: unknown[],
  merchants: MerchantRow[],
): MerchantClassification[] {
  const byId = new Map(merchants.map((merchant) => [merchant.id, merchant]));
  const seen = new Set<string>();
  const out: MerchantClassification[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);

    const confidence = Math.max(0, Math.min(100, Number(record.confidence) || 0));
    const proposed = Number(record.vendor_type_id);
    const valid = Number.isInteger(proposed) && VALID_TYPE_IDS.has(proposed);
    out.push({
      id,
      vendor_type_id: valid ? proposed : null,
      confidence,
      needs_human_review: !valid || confidence < CONFIDENCE_THRESHOLD,
    });
  }

  for (const merchant of merchants) {
    if (seen.has(merchant.id)) continue;
    out.push({
      id: merchant.id,
      vendor_type_id: null,
      confidence: 0,
      needs_human_review: true,
    });
  }
  return out;
}

export { extractJsonArray };
