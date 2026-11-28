import { clean, normalizeDigits } from "./csv";

/**
 * Cairo wall-clock timestamps from a spreadsheet.
 *
 * The PO export prints delivery times in `Africa/Cairo` without an offset
 * (`2026-11-22 20:14:50`). Parsing that with `new Date()` would read it in the
 * runtime's timezone, and truncating it to a date would move the order to a
 * different operating day. This helper keeps the exact minute and resolves it
 * to a real UTC instant, so the business-day cutoff is applied to the real
 * Cairo clock rather than to a guess.
 */

const TIME_ZONE = "Africa/Cairo";

const wallClock = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function cairoOffsetMs(instant: Date): number {
  const parts = wallClock.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return asUtc - instant.getTime();
}

function cairoInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return new Date(guess.getTime() - cairoOffsetMs(guess));
}

export type ParsedTimestamp = {
  /** UTC instant as an ISO-8601 string, safe to store in `timestamptz`. */
  iso: string;
  /** True when the source cell carried an explicit clock time. */
  hasTime: boolean;
};

const ISO_PATTERN =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
const DAY_FIRST_PATTERN =
  /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

function build(
  year: number,
  month: number,
  day: number,
  hour: string | undefined,
  minute: string | undefined,
  second: string | undefined,
): ParsedTimestamp | null {
  const hasTime = hour !== undefined;
  const h = hasTime ? Number(hour) : 0;
  const m = hasTime ? Number(minute) : 0;
  const s = hasTime && second !== undefined ? Number(second) : 0;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    h > 23 ||
    m > 59 ||
    s > 59
  ) {
    return null;
  }
  return {
    iso: cairoInstant(year, month, day, h, m, s).toISOString(),
    hasTime,
  };
}

/**
 * Parses a cell as a Cairo wall-clock timestamp.
 *
 * Accepts `YYYY-MM-DD`, `YYYY-MM-DD HH:mm[:ss]`, `DD/MM/YYYY[ HH:mm[:ss]]` and
 * anything else the platform can parse (an explicit `Z`/offset is respected as
 * an instant). Returns null when the cell is empty or unreadable.
 */
export function parseCairoTimestamp(value: unknown): ParsedTimestamp | null {
  const text = normalizeDigits(clean(value)).replace(/\s+/g, " ").trim();
  if (text === "") return null;

  const iso = ISO_PATTERN.exec(text);
  if (iso) {
    return build(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      iso[4],
      iso[5],
      iso[6],
    );
  }

  const dayFirst = DAY_FIRST_PATTERN.exec(text);
  if (dayFirst) {
    return build(
      Number(dayFirst[3]),
      Number(dayFirst[2]),
      Number(dayFirst[1]),
      dayFirst[4],
      dayFirst[5],
      dayFirst[6],
    );
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return { iso: parsed.toISOString(), hasTime: /[T ]\d{1,2}:\d{2}/.test(text) };
}
