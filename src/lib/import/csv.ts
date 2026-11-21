/**
 * Shared CSV cell helpers.
 *
 * A spreadsheet exported in an Arabic locale mixes Arabic-Indic digits,
 * thousands separators and free-text headers. These pure helpers normalise one
 * cell the same way for every importer, so the client preview and the server
 * write can never disagree about how a value was read.
 */

/** Arabic-Indic digits to Western, so a spreadsheet locale cannot break amounts. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/[\u06f0-\u06f9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    );
}

/** Trims, collapses internal whitespace, and lowercases for matching. */
export function matchKey(value: string): string {
  return normalizeDigits(value).trim().replace(/\s+/g, " ").toLowerCase();
}

/** Reads a cell as trimmed text; numbers keep their literal form. */
export function clean(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Reads a field by any of its accepted header spellings. */
export function field(
  row: Record<string, unknown>,
  ...names: string[]
): unknown {
  const normalised = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalised.set(matchKey(key).replace(/[\s_-]/g, ""), value);
  }
  for (const name of names) {
    const key = matchKey(name).replace(/[\s_-]/g, "");
    if (normalised.has(key)) return normalised.get(key);
  }
  return undefined;
}

/**
 * Parses a money cell. Strips currency glyphs, thousands separators and Arabic
 * digits; a non-positive or unparseable amount is null so the row is reported
 * instead of being posted as zero.
 */
export function parseAmount(value: unknown): number | null {
  const text = normalizeDigits(clean(value))
    .replace(/[٬,]/g, "")
    .replace(/[^\d.-]/g, "");
  if (text === "" || text === "-" || text === ".") return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100) / 100;
}

/** Accepts a non-negative fee cell; an empty cell means zero. */
export function parseFee(value: unknown): number {
  const text = normalizeDigits(clean(value))
    .replace(/[٬,]/g, "")
    .replace(/[^\d.-]/g, "");
  if (text === "") return 0;
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100) / 100;
}
