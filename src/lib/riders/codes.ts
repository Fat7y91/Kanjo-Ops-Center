import type { CustodyItemKey } from "./types";

export type LocationCodeParts = {
  govAlpha: string;
  cityAlpha: string;
  govNum: string;
  cityNum: string;
};

export const FIXED_ITEM_PREFIXES: Record<
  Exclude<CustodyItemKey, "OTHER">,
  string
> = {
  HB: "HB",
  HP: "HP",
  TSH: "TSH",
  CAP: "CAP",
};

function cleanAlpha(value: string): string {
  return value.trim().toUpperCase();
}

function cleanNumeric(value: string): string {
  return value.trim();
}

export function paddedSequence(sequence: number): string {
  const value = Number.isFinite(sequence) ? Math.trunc(sequence) : 0;
  return String(Math.max(0, value)).padStart(4, "0");
}

export function buildRiderCode(
  parts: LocationCodeParts,
  sequence: number,
): string {
  return `${cleanNumeric(parts.govNum)}${cleanNumeric(parts.cityNum)}${paddedSequence(sequence)}`;
}

export function buildCustodyNumber(
  parts: LocationCodeParts,
  sequence: number,
): string {
  return `${cleanAlpha(parts.govAlpha)}-${cleanAlpha(parts.cityAlpha)}-${paddedSequence(sequence)}`;
}

export function buildItemSerial(
  key: CustodyItemKey,
  parts: LocationCodeParts,
  sequence: number,
  quantity: number,
  customPrefix?: string | null,
): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const prefix =
    key === "OTHER"
      ? cleanAlpha(customPrefix ?? "")
      : FIXED_ITEM_PREFIXES[key];
  if (!prefix) return null;
  return `${cleanAlpha(parts.govAlpha)}-${cleanAlpha(parts.cityAlpha)}-${prefix}-${paddedSequence(sequence)}`;
}

export function nextSequence(
  maxSequence: number | null,
  startingSequence: number,
): number {
  const max = Number.isFinite(maxSequence) ? Math.trunc(maxSequence ?? 0) : 0;
  const start = Number.isFinite(startingSequence)
    ? Math.max(1, Math.trunc(startingSequence))
    : 1;
  return Math.max(max + 1, start);
}
