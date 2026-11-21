import {
  cleanCellText,
  isSummaryRow,
  looksLikeBarcode,
  looksLikeHeaderRow,
  looksLikeUnit,
  parsePriceMinor,
} from "./parse-values";
import type { PosColumnMap } from "./types";

/**
 * Header-less column detection for messy POS exports.
 *
 * The parser profiles the first few hundred rows: barcodes are digit strings,
 * prices are money-like numbers, units are short known labels, and names are
 * free text. Merge cells and spacer columns simply produce empty profiles.
 *
 * Split from `parse-columns.ts` so header parsing and value profiling stay
 * independently testable and each file stays well under the size limit.
 */

export type ColumnDetection = {
  headerRow: number | null;
  columns: PosColumnMap;
};

export function emptyColumns(): PosColumnMap {
  return { name: null, price: null, barcode: null, unit: null };
}

type ColumnProfile = {
  index: number;
  nonEmpty: number;
  price: number;
  barcode: number;
  unit: number;
  text: number;
  uniqueCodes: Set<string>;
  uniqueAll: Set<string>;
};

function profileColumns(matrix: unknown[][], startRow: number): ColumnProfile[] {
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const profiles: ColumnProfile[] = Array.from({ length: width }, (_, index) => ({
    index,
    nonEmpty: 0,
    price: 0,
    barcode: 0,
    unit: 0,
    text: 0,
    uniqueCodes: new Set<string>(),
    uniqueAll: new Set<string>(),
  }));

  const limit = Math.min(matrix.length, startRow + 400);
  for (let row = startRow; row < limit; row += 1) {
    const values = matrix[row] ?? [];
    if (values.every((value) => cleanCellText(value) === "")) continue;
    if (isSummaryRow(values)) continue;
    if (looksLikeHeaderRow(values)) continue;

    values.forEach((value, index) => {
      const profile = profiles[index];
      if (!profile) return;
      const text = cleanCellText(value);
      if (!text) return;

      profile.nonEmpty += 1;
      profile.uniqueAll.add(text);
      if (looksLikeBarcode(value)) {
        profile.barcode += 1;
        profile.uniqueCodes.add(text);
      } else if (parsePriceMinor(value) !== null) {
        profile.price += 1;
      }
      if (looksLikeUnit(value)) profile.unit += 1;
      else if (/\p{L}/u.test(text) && text.length >= 2 && text.length <= 160) {
        profile.text += 1;
      }
    });
  }

  // Columns that never contained a value get no profile; they are spacers.
  return profiles.filter((profile) => profile.nonEmpty > 0);
}

function ratio(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function bestColumn(
  profiles: ColumnProfile[],
  score: (profile: ColumnProfile) => number,
  excluded: Set<number>,
): ColumnProfile | null {
  return (
    profiles
      .filter((profile) => !excluded.has(profile.index))
      .map((profile) => ({ profile, value: score(profile) }))
      .filter((entry) => entry.value > 0)
      .sort(
        (left, right) =>
          right.value - left.value || left.profile.index - right.profile.index,
      )[0]?.profile ?? null
  );
}

export function detectByProfile(matrix: unknown[][]): ColumnDetection | null {
  const profiles = profileColumns(matrix, 0);
  if (profiles.length === 0) return null;

  const barcodeProfile = bestColumn(
    profiles,
    (profile) =>
      ratio(profile.barcode, profile.nonEmpty) *
      (0.5 + 0.5 * ratio(profile.uniqueCodes.size, Math.max(1, profile.barcode))),
    new Set(),
  );
  const barcode =
    barcodeProfile &&
    ratio(barcodeProfile.barcode, barcodeProfile.nonEmpty) >= 0.5
      ? barcodeProfile
      : null;

  const excluded = new Set<number>();
  if (barcode) excluded.add(barcode.index);

  const priceProfile = bestColumn(
    profiles,
    (profile) => ratio(profile.price, profile.nonEmpty),
    excluded,
  );
  const price =
    priceProfile && ratio(priceProfile.price, priceProfile.nonEmpty) >= 0.3
      ? priceProfile
      : null;
  if (price) excluded.add(price.index);

  const nameProfile = bestColumn(
    profiles,
    (profile) =>
      ratio(profile.text, profile.nonEmpty) *
      Math.min(1.4, 0.7 + profile.uniqueAll.size / Math.max(20, profile.nonEmpty)),
    excluded,
  );
  const name =
    nameProfile && ratio(nameProfile.text, nameProfile.nonEmpty) >= 0.3
      ? nameProfile
      : null;
  if (name) excluded.add(name.index);

  const unitProfile = bestColumn(
    profiles,
    (profile) => ratio(profile.unit, profile.nonEmpty),
    excluded,
  );
  const unit =
    unitProfile && ratio(unitProfile.unit, unitProfile.nonEmpty) >= 0.4
      ? unitProfile
      : null;

  if (!name || !price) return null;

  return {
    headerRow: null,
    columns: {
      name: name.index,
      price: price.index,
      barcode: barcode?.index ?? null,
      unit: unit?.index ?? null,
    },
  };
}
