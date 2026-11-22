import { FIXED_ITEM_PREFIXES } from "./codes";
import {
  CUSTODY_ITEM_LABEL,
  type CustodyItem,
  type CustodyItemDraft,
  type CustodyItemKey,
} from "./types";

export function roundMoney(value: number): number {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.round((safe + Number.EPSILON) * 100) / 100;
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(
    Math.max(0, Number(quantity) || 0) * Math.max(0, Number(unitPrice) || 0),
  );
}

export function itemsTotal(items: readonly CustodyItem[]): number {
  return roundMoney(
    items.reduce((sum, item) => sum + lineTotal(item.quantity, item.unitPrice), 0),
  );
}

export function custodyTotal(
  items: readonly CustodyItem[],
  cashCustody: number,
): number {
  return roundMoney(itemsTotal(items) + Math.max(0, Number(cashCustody) || 0));
}

function clampQuantity(value: number): number {
  const safe = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
  return Math.min(99, Math.max(0, safe));
}

export function normalizeItems(
  drafts: readonly CustodyItemDraft[],
): CustodyItem[] {
  return drafts.map((draft) => {
    const key: CustodyItemKey = draft.key;
    const quantity = clampQuantity(draft.quantity);
    const unitPrice = roundMoney(Math.max(0, Number(draft.unitPrice) || 0));
    const customPrefix = draft.codePrefix?.trim().toUpperCase() || null;
    const codePrefix =
      key === "OTHER" ? customPrefix : FIXED_ITEM_PREFIXES[key];
    const label =
      key === "OTHER" && draft.label?.trim()
        ? draft.label.trim().slice(0, 80)
        : CUSTODY_ITEM_LABEL[key];

    return {
      key,
      label,
      codePrefix,
      serial:
        quantity > 0
          ? draft.serial?.trim().slice(0, 40) || null
          : null,
      quantity,
      condition: draft.condition?.trim().slice(0, 40) || "جديد",
      unitPrice,
      lineTotal: lineTotal(quantity, unitPrice),
    };
  });
}

export function totalItemCount(items: readonly CustodyItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function hasCustodyItems(items: readonly CustodyItem[]): boolean {
  return items.some((item) => item.quantity > 0 && item.lineTotal > 0);
}
