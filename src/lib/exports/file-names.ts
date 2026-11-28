import type { ClearingReportKind } from "@/lib/operations/clearing-report";

/**
 * Descriptive Arabic file names for every accounting export.
 *
 * The browser uses these verbatim for Excel downloads and for the Print /
 * Save-as-PDF dialog (`document.title`), so a finance operator gets a file that
 * names the report, the party and the Cairo date instead of a generic slug.
 * Pure and clock-injectable so the exact strings are unit tested.
 */

const CAIRO = "Africa/Cairo";

/** Formats a date as `DD-MM-YYYY` on the Cairo calendar. */
export function cairoFileDate(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")}`;
}

/**
 * Strips characters that are illegal in a filename or would break the
 * Content-Disposition header. Arabic text is preserved.
 */
export function sanitizeFileSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^-+|-+$/g, "");
}

function withEntity(prefix: string, entity: string, at: Date): string {
  const safe = sanitizeFileSegment(entity);
  const date = cairoFileDate(at);
  return safe ? `${prefix} ${safe} ${date}` : `${prefix} ${date}`;
}

/** `كشف حساب تاجر <merchant> <date>` / `كشف حساب مندوب توصيل <courier> <date>`. */
export function statementFileBase(
  partyType: "merchant" | "courier",
  partyName: string,
  at: Date = new Date(),
): string {
  const prefix =
    partyType === "merchant"
      ? "كشف حساب تاجر"
      : "كشف حساب مندوب توصيل";
  return withEntity(prefix, partyName, at);
}

/** `كشف إجمالي التحصيلات المعتمدة <date>` / `كشف إجمالي السدادات والمستحقات <date>`. */
export function clearingReportFileBase(
  kind: ClearingReportKind,
  at: Date = new Date(),
): string {
  const title =
    kind === "collections"
      ? "كشف إجمالي التحصيلات المعتمدة"
      : "كشف إجمالي السدادات والمستحقات";
  return `${title} ${cairoFileDate(at)}`;
}

/** `عقد شراكة <merchant> <date>`. */
export function contractFileBase(
  merchantName: string,
  at: Date = new Date(),
): string {
  return withEntity("عقد شراكة", merchantName, at);
}

/** Appends the spreadsheet extension to a base name. */
export function excelFileName(base: string): string {
  return `${base}.xlsx`;
}
