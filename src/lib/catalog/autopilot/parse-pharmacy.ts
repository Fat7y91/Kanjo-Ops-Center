import { normalizeSearchText } from "@/lib/search/normalize";

import type { ParsedPosItem } from "./types";

/**
 * Pharmacy POS exports often repeat the same product once per batch/expiry, so
 * the same code appears several times with different quantities. Importing it
 * once per row would create duplicate catalog entries. This pure helper merges
 * repeats while keeping the merchant's identity fields intact: the first row's
 * name/unit/company/code win, the highest price is kept, and stock is summed.
 */

export type DedupeResult = {
  items: ParsedPosItem[];
  merged: number;
};

function dedupeKey(item: ParsedPosItem): string {
  return item.barcode || `name:${normalizeSearchText(item.name)}`;
}

function sumQuantity(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null && right === null) return null;
  return (left ?? 0) + (right ?? 0);
}

export function dedupePosItems(items: ParsedPosItem[]): DedupeResult {
  const byKey = new Map<string, ParsedPosItem>();
  const order: string[] = [];
  let merged = 0;

  for (const item of items) {
    const key = dedupeKey(item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item });
      order.push(key);
      continue;
    }

    merged += 1;
    byKey.set(key, {
      ...existing,
      priceMinor: Math.max(existing.priceMinor, item.priceMinor),
      quantity: sumQuantity(existing.quantity, item.quantity),
      unit: existing.unit || item.unit,
      company: existing.company || item.company,
      barcode: existing.barcode || item.barcode,
    });
  }

  return { items: order.map((key) => byKey.get(key)!), merged };
}

/** True when at least one row carries a stock figure worth filtering on. */
export function hasStockData(items: ParsedPosItem[]): boolean {
  return items.some((item) => item.quantity !== null);
}

/** Keeps in-stock rows; rows without a quantity are kept (unknown stock). */
export function inStockItems(items: ParsedPosItem[]): ParsedPosItem[] {
  return items.filter((item) => item.quantity === null || item.quantity > 0);
}
